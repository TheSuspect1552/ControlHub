package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"
	"bytes"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"golang.org/x/text/encoding/charmap"
)

var (
	ServerHost = "localhost:8000" // Can be overridden at build time
	Token      = "secure-company-token-123"
)

type AgentMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type ExecuteData struct {
	CommandId string `json:"commandId"`
	Command   string `json:"command"`
}

type DirectMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

var conn *websocket.Conn

func main() {
	agentId := getAgentId()
	log.Printf("Starting Enterprise Agent. ID: %s", agentId)
	
	spawnWidget()

	host := ServerHost
	scheme := "ws"

	if strings.HasPrefix(host, "https://") {
		scheme = "wss"
		host = strings.TrimPrefix(host, "https://")
	} else if strings.HasPrefix(host, "http://") {
		scheme = "ws"
		host = strings.TrimPrefix(host, "http://")
	} else if strings.HasPrefix(host, "wss://") {
		scheme = "wss"
		host = strings.TrimPrefix(host, "wss://")
	} else if strings.HasPrefix(host, "ws://") {
		scheme = "ws"
		host = strings.TrimPrefix(host, "ws://")
	} else if strings.HasSuffix(host, ":443") {
		scheme = "wss"
	} else if !strings.Contains(host, ":") {
		// If it's a bare domain without a port, assume WSS is safer for modern web, 
		// but since default was WS, we'll keep WS unless specified.
	}

	u := url.URL{Scheme: scheme, Host: host, Path: "/ws", RawQuery: fmt.Sprintf("role=agent&token=%s&agentId=%s", Token, agentId)}

	for {
		log.Printf("Connecting to %s", u.String())
		var err error
		conn, _, err = websocket.DefaultDialer.Dial(u.String(), nil)
		if err != nil {
			log.Printf("Dial error: %v. Retrying in 5s...", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Println("Connected to control server")

		hostname, ip, osName, cpuName, ramSize := getSystemInfo()
		regMsg := AgentMessage{
			Type: "register",
			Data: map[string]string{
				"hostname": hostname,
				"ip":       ip,
				"os":       osName,
				"cpu":      cpuName,
				"ram":      ramSize,
			},
		}
		conn.WriteJSON(regMsg)

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Println("Read error:", err)
				break
			}

			var msg AgentMessage
			if err := json.Unmarshal(message, &msg); err == nil {
				if msg.Type == "execute" {
					var execData ExecuteData
					dataBytes, _ := json.Marshal(msg.Data)
					json.Unmarshal(dataBytes, &execData)

					go func(data ExecuteData) {
						log.Printf("Executing command: %s", data.Command)
						success, output, exitCode := runCmd(data.Command)

						resMsg := AgentMessage{
							Type: "result",
							Data: map[string]interface{}{
								"commandId": data.CommandId,
								"success":   success,
								"output":    output,
								"exitCode":  exitCode,
							},
						}
						conn.WriteJSON(resMsg)
					}(execData)
				} else if msg.Type == "fs_list" {
					path := msg.Data.(map[string]interface{})["path"].(string)
					go func(p string) {
						list, err := fsListDir(p)
						errStr := ""
						if err != nil { errStr = err.Error() }
						conn.WriteJSON(AgentMessage{
							Type: "fs_list_res",
							Data: map[string]interface{}{"path": p, "list": list, "error": errStr},
						})
					}(path)
				} else if msg.Type == "fs_delete" {
					path := msg.Data.(map[string]interface{})["path"].(string)
					go func(p string) {
						err := fsDelete(p)
						errStr := ""
						if err != nil { errStr = err.Error() }
						conn.WriteJSON(AgentMessage{
							Type: "fs_delete_res",
							Data: map[string]interface{}{"path": p, "error": errStr},
						})
					}(path)
				} else if msg.Type == "fs_read" {
					path := msg.Data.(map[string]interface{})["path"].(string)
					go func(p string) {
						b64, err := fsReadFile(p)
						errStr := ""
						if err != nil { errStr = err.Error() }
						conn.WriteJSON(AgentMessage{
							Type: "fs_read_res",
							Data: map[string]interface{}{"path": p, "data": b64, "error": errStr},
						})
					}(path)
				} else if msg.Type == "fs_write" {
					path := msg.Data.(map[string]interface{})["path"].(string)
					b64 := msg.Data.(map[string]interface{})["data"].(string)
					go func(p, d string) {
						err := fsWriteFile(p, d)
						errStr := ""
						if err != nil { errStr = err.Error() }
						conn.WriteJSON(AgentMessage{
							Type: "fs_write_res",
							Data: map[string]interface{}{"path": p, "error": errStr},
						})
					}(path, b64)
				} else if msg.Type == "stream_start" {
					if data, ok := msg.Data.(map[string]interface{}); ok {
						fps := int(data["fps"].(float64))
						width := int(data["width"].(float64))
						quality := int(data["quality"].(float64))
						SetStreamConfig(fps, width, quality)
					}
					startStreaming(func(data []byte) {
						conn.WriteMessage(websocket.BinaryMessage, data)
					})
				} else if msg.Type == "stream_config" {
					if data, ok := msg.Data.(map[string]interface{}); ok {
						fps := int(data["fps"].(float64))
						width := int(data["width"].(float64))
						quality := int(data["quality"].(float64))
						SetStreamConfig(fps, width, quality)
					}
				} else if msg.Type == "stream_stop" {
					stopStreaming()
				} else if msg.Type == "input_mouse" {
					data := msg.Data.(map[string]interface{})
					action := data["action"].(string)

					px := data["px"].(float64)
					py := data["py"].(float64)
					setCursorPosProportional(px, py)

					if action == "click" {
						mouseClick(data["button"].(string), true, true)
					} else if action == "down" {
						mouseClick(data["button"].(string), true, false)
					} else if action == "up" {
						mouseClick(data["button"].(string), false, true)
					}
				} else if msg.Type == "input_key" {
					data := msg.Data.(map[string]interface{})
					vk := uint8(data["vk"].(float64))
					action := data["action"].(string) // down, up, click
					if action == "click" {
						keybdEvent(vk, true, true)
					} else if action == "down" {
						keybdEvent(vk, true, false)
					} else if action == "up" {
						keybdEvent(vk, false, true)
					}
				} else if msg.Type == "kill_agent" {
					log.Println("Received kill command. Terminating.")
					os.Exit(0)
				}
			}
		}
		
		stopStreaming()
		conn.Close()
		log.Println("Disconnected. Reconnecting in 5s...")
		time.Sleep(5 * time.Second)
	}
}

func runCommand(name string, arg ...string) (string, error) {
	cmd := exec.Command(name, arg...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	return out.String(), err
}

func getSystemInfo() (hostname, ip, osName, cpuName, ramSize string) {
	hostname = "Unknown"
	if h, err := runCommand("hostname"); err == nil {
		hostname = strings.TrimSpace(h)
	}
	
	ip = "Unknown"
	if runtime.GOOS == "windows" {
		if out, err := runCommand("powershell", "-NoProfile", "-Command", "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi','Ethernet' -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress"); err == nil {
			ipStr := strings.TrimSpace(out)
			if ipStr != "" { ip = ipStr }
		}
	}
	
	osName = runtime.GOOS
	cpuName = runtime.GOARCH
	ramSize = "Unknown"

	if runtime.GOOS == "windows" {
		if out, err := runCommand("powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption"); err == nil {
			osName = strings.TrimSpace(out)
		}
		if out, err := runCommand("powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name"); err == nil {
			cpuName = strings.TrimSpace(out)
		}
		if out, err := runCommand("powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [math]::round((Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum / 1GB, 1)"); err == nil {
			ramSize = strings.TrimSpace(out) + " GB"
		}
	}
	return
}

func runCmd(command string) (bool, string, int) {
	cmd := exec.Command("cmd.exe", "/c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()

	decoder := charmap.CodePage866.NewDecoder()
	
	outputBytes := stdoutBuf.Bytes()
	if stderrBuf.Len() > 0 {
		if len(outputBytes) > 0 {
			outputBytes = append(outputBytes, '\n')
		}
		outputBytes = append(outputBytes, []byte("STDERR:\n")...)
		outputBytes = append(outputBytes, stderrBuf.Bytes()...)
	}

	decodedOutput, decErr := decoder.Bytes(outputBytes)
	output := ""
	if decErr == nil {
		output = string(decodedOutput)
	} else {
		output = string(outputBytes)
	}

	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = -1
			output += "\nExecution Error: " + err.Error()
		}
		return false, output, exitCode
	}

	return true, output, 0
}

func getAgentId() string {
	cmd := exec.Command("cmd.exe", "/c", "reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err == nil {
		str := string(out)
		parts := strings.Split(str, "REG_SZ")
		if len(parts) >= 2 {
			guid := strings.TrimSpace(parts[1])
			if guid != "" {
				return guid
			}
		}
	}
	
	configPath := os.Getenv("APPDATA") + "\\.controlhub_agent_id"
	b, err := os.ReadFile(configPath)
	if err == nil && len(b) > 0 {
		return strings.TrimSpace(string(b))
	}

	newId := uuid.New().String()
	os.WriteFile(configPath, []byte(newId), 0644)
	return newId
}
