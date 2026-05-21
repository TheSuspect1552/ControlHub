//go:build windows
// +build windows

package main

import (
	"syscall"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	procmouse_event  = user32.NewProc("mouse_event")
	prockeybd_event  = user32.NewProc("keybd_event")
	procSetCursorPos = user32.NewProc("SetCursorPos")
)

const (
	MOUSEEVENTF_MOVE       = 0x0001
	MOUSEEVENTF_LEFTDOWN   = 0x0002
	MOUSEEVENTF_LEFTUP     = 0x0004
	MOUSEEVENTF_RIGHTDOWN  = 0x0008
	MOUSEEVENTF_RIGHTUP    = 0x0010
	MOUSEEVENTF_MIDDLEDOWN = 0x0020
	MOUSEEVENTF_MIDDLEUP   = 0x0040
	MOUSEEVENTF_ABSOLUTE   = 0x8000
	MOUSEEVENTF_WHEEL      = 0x0800
	KEYEVENTF_KEYUP        = 0x0002
)

func setCursorPosProportional(px, py float64) {
	dx := uintptr(px * 65535)
	dy := uintptr(py * 65535)
	procmouse_event.Call(MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE, dx, dy, 0, 0)
}

func setCursorPos(x, y int) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
}

func mouseClick(button string, down, up bool) {
	var flagDown, flagUp uintptr
	switch button {
	case "left":
		flagDown = MOUSEEVENTF_LEFTDOWN
		flagUp = MOUSEEVENTF_LEFTUP
	case "right":
		flagDown = MOUSEEVENTF_RIGHTDOWN
		flagUp = MOUSEEVENTF_RIGHTUP
	case "middle":
		flagDown = MOUSEEVENTF_MIDDLEDOWN
		flagUp = MOUSEEVENTF_MIDDLEUP
	}

	if down {
		procmouse_event.Call(flagDown, 0, 0, 0, 0)
	}
	if up {
		procmouse_event.Call(flagUp, 0, 0, 0, 0)
	}
}

func mouseScroll(amount int) {
	procmouse_event.Call(MOUSEEVENTF_WHEEL, 0, 0, uintptr(int32(amount)), 0)
}

func keybdEvent(vk uint8, down, up bool) {
	if down {
		prockeybd_event.Call(uintptr(vk), 0, 0, 0)
	}
	if up {
		prockeybd_event.Call(uintptr(vk), 0, KEYEVENTF_KEYUP, 0)
	}
}
