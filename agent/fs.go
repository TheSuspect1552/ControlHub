package main

import (
	"encoding/base64"
	"io/ioutil"
	"os"
	"path/filepath"
)

type FileInfo struct {
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
	ModTime string `json:"modTime"`
}

func fsListDir(path string) ([]FileInfo, error) {
	if path == "" {
		// On Windows, if path is empty, maybe return drives? Or default to C:\
		path = "C:\\"
	}
	
	entries, err := ioutil.ReadDir(path)
	if err != nil {
		return nil, err
	}

	var list []FileInfo
	for _, e := range entries {
		list = append(list, FileInfo{
			Name:  e.Name(),
			IsDir: e.IsDir(),
			Size:  e.Size(),
			ModTime: e.ModTime().Format("2006-01-02 15:04:05"),
		})
	}
	return list, nil
}

func fsReadFile(path string) (string, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return "", err
	}
	// Encode to base64 for safe JSON transport
	return base64.StdEncoding.EncodeToString(data), nil
}

func fsWriteFile(path string, base64Data string) error {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err
	}
	// create dirs if not exist
	os.MkdirAll(filepath.Dir(path), 0755)
	return ioutil.WriteFile(path, data, 0644)
}

func fsDelete(path string) error {
	return os.RemoveAll(path)
}
