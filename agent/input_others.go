//go:build !windows
// +build !windows

package main

func setCursorPos(x, y int) {}
func mouseClick(button string, down, up bool) {}
func mouseScroll(amount int) {}
func keybdEvent(vk uint8, down, up bool) {}
