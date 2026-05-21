package main

import (
	"bytes"
	"image"
	"image/jpeg"
	"log"
	"sync"
	"time"

	"github.com/kbinani/screenshot"
	"golang.org/x/image/draw"
)

type StreamConfig struct {
	FPS     int
	Width   int
	Quality int
}

var (
	streaming   bool
	streamCfg   StreamConfig = StreamConfig{FPS: 15, Width: 1280, Quality: 50}
	streamMutex sync.Mutex
)

func SetStreamConfig(fps, width, quality int) {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	if fps > 0 {
		streamCfg.FPS = fps
	}
	if width > 0 {
		streamCfg.Width = width
	}
	if quality > 0 {
		streamCfg.Quality = quality
	}
}

func startStreaming(sendFrame func(data []byte)) {
	streamMutex.Lock()
	if streaming {
		streamMutex.Unlock()
		return
	}
	streaming = true
	fps := streamCfg.FPS
	streamMutex.Unlock()

	go func() {
		log.Println("Screen stream started")
		ticker := time.NewTicker(time.Second / time.Duration(fps))
		defer ticker.Stop()

		var lastFPS int = fps

		for range ticker.C {
			streamMutex.Lock()
			if !streaming {
				streamMutex.Unlock()
				break
			}
			currentCfg := streamCfg
			streamMutex.Unlock()

			if currentCfg.FPS != lastFPS {
				lastFPS = currentCfg.FPS
				ticker.Reset(time.Second / time.Duration(lastFPS))
			}

			bounds := screenshot.GetDisplayBounds(0)
			img, err := screenshot.CaptureRect(bounds)
			if err != nil {
				log.Println("Screenshot error:", err)
				continue
			}

			var finalImg image.Image = img

			// 0 or large width means native
			if currentCfg.Width > 0 && img.Bounds().Dx() > currentCfg.Width {
				ratio := float64(currentCfg.Width) / float64(img.Bounds().Dx())
				targetHeight := int(float64(img.Bounds().Dy()) * ratio)
				dst := image.NewRGBA(image.Rect(0, 0, currentCfg.Width, targetHeight))
				draw.ApproxBiLinear.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Src, nil)
				finalImg = dst
			}

			var buf bytes.Buffer
			buf.WriteByte(0x01)
			
			q := currentCfg.Quality
			if q <= 0 {
				q = 60
			}

			err = jpeg.Encode(&buf, finalImg, &jpeg.Options{Quality: q})
			if err == nil {
				sendFrame(buf.Bytes())
			}
		}
		log.Println("Screen stream stopped")
	}()
}

func stopStreaming() {
	streamMutex.Lock()
	streaming = false
	streamMutex.Unlock()
}
