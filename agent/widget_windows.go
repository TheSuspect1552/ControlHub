//go:build windows
// +build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	moduser32   = syscall.NewLazyDLL("user32.dll")
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	modgdi32    = syscall.NewLazyDLL("gdi32.dll")

	procRegisterClassExW           = moduser32.NewProc("RegisterClassExW")
	procCreateWindowExW            = moduser32.NewProc("CreateWindowExW")
	procDefWindowProcW             = moduser32.NewProc("DefWindowProcW")
	procGetMessageW                = moduser32.NewProc("GetMessageW")
	procTranslateMessage           = moduser32.NewProc("TranslateMessage")
	procDispatchMessageW           = moduser32.NewProc("DispatchMessageW")
	procSetLayeredWindowAttributes = moduser32.NewProc("SetLayeredWindowAttributes")
	procPostQuitMessage            = moduser32.NewProc("PostQuitMessage")
	procInvalidateRect             = moduser32.NewProc("InvalidateRect")
	procGetSystemMetrics = moduser32.NewProc("GetSystemMetrics")

	procBeginPaint       = moduser32.NewProc("BeginPaint")
	procEndPaint         = moduser32.NewProc("EndPaint")
	procCreateSolidBrush = modgdi32.NewProc("CreateSolidBrush")
	procFillRect         = moduser32.NewProc("FillRect")
	procDeleteObject     = modgdi32.NewProc("DeleteObject")
	procEllipse          = modgdi32.NewProc("Ellipse")
	procPolygon          = modgdi32.NewProc("Polygon")
	procSelectObject     = modgdi32.NewProc("SelectObject")
)

const (
	WS_POPUP         = 0x80000000
	WS_VISIBLE       = 0x10000000
	WS_EX_TOPMOST    = 0x00000008
	WS_EX_TOOLWINDOW = 0x00000080
	WS_EX_LAYERED    = 0x00080000

	WM_DESTROY       = 0x0002
	WM_CLOSE         = 0x0010
	WM_PAINT         = 0x000F
	WM_NCHITTEST     = 0x0084
	WM_LBUTTONDOWN   = 0x0201
	WM_LBUTTONUP     = 0x0202

	HTCAPTION    = 2
	LWA_COLORKEY = 0x00000001

	COLOR_WINDOW = 5
)

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     syscall.Handle
	HIcon         syscall.Handle
	HCursor       syscall.Handle
	HbrBackground syscall.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       syscall.Handle
}

type POINT struct {
	X, Y int32
}

type MSG struct {
	Hwnd    syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      POINT
}

type RECT struct {
	Left, Top, Right, Bottom int32
}

type PAINTSTRUCT struct {
	Hdc         syscall.Handle
	FErase      int32
	RcPaint     RECT
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

var (
	isPressed bool
)

func getSystemMetrics(index int) int32 {
	ret, _, _ := procGetSystemMetrics.Call(uintptr(index))
	return int32(ret)
}

func wndProc(hwnd syscall.Handle, msg uint32, wparam, lparam uintptr) uintptr {
	switch msg {
	case WM_NCHITTEST:
		return HTCAPTION
	case WM_LBUTTONDOWN:
		isPressed = true
		procInvalidateRect.Call(uintptr(hwnd), 0, 1)
	case WM_LBUTTONUP:
		isPressed = false
		procInvalidateRect.Call(uintptr(hwnd), 0, 1)
	case WM_PAINT:
		var ps PAINTSTRUCT
		procBeginPaint.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&ps)))

		// Fill background with magenta (transparent color key)
		hBrushBg, _, _ := procCreateSolidBrush.Call(uintptr(0x00FF00FF))
		procFillRect.Call(uintptr(ps.Hdc), uintptr(unsafe.Pointer(&ps.RcPaint)), hBrushBg)
		procDeleteObject.Call(hBrushBg)

		// Calculate Y offset for press animation
		var yOffset int32 = 0
		if isPressed {
			yOffset = 3
		}

		// Draw white duck body
		hBrushBody, _, _ := procCreateSolidBrush.Call(uintptr(0x00FFFFFF)) // White
		hBrushOld, _, _ := procSelectObject.Call(uintptr(ps.Hdc), hBrushBody)
		
		// Body (ellipse)
		procEllipse.Call(uintptr(ps.Hdc), 
			uintptr(4), uintptr(4+int(yOffset)), 
			uintptr(28), uintptr(28+int(yOffset)))
		
		// Draw black eye
		hBrushEye, _, _ := procCreateSolidBrush.Call(uintptr(0x00000000)) // Black
		procSelectObject.Call(uintptr(ps.Hdc), hBrushEye)
		procEllipse.Call(uintptr(ps.Hdc), 
			uintptr(20), uintptr(8+int(yOffset)), 
			uintptr(24), uintptr(12+int(yOffset)))
		
		// Draw orange beak (triangle)
		hBrushBeak, _, _ := procCreateSolidBrush.Call(uintptr(0x00008CFF)) // Orange (RGB: 255,140,0)
		procSelectObject.Call(uintptr(ps.Hdc), hBrushBeak)
		
		// Triangle points for beak
		points := []POINT{
			{X: 24, Y: 14 + yOffset},
			{X: 30, Y: 16 + yOffset},
			{X: 24, Y: 18 + yOffset},
		}
		procPolygon.Call(uintptr(ps.Hdc), 
			uintptr(unsafe.Pointer(&points[0])), 
			uintptr(3))
		
		// Cleanup
		procSelectObject.Call(uintptr(ps.Hdc), hBrushOld)
		procDeleteObject.Call(hBrushBody)
		procDeleteObject.Call(hBrushEye)
		procDeleteObject.Call(hBrushBeak)

		procEndPaint.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&ps)))
		return 0
	case WM_CLOSE:
		return 0
	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}
	ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wparam, lparam)
	return ret
}

func spawnWidget() {
	go func() {
		className, _ := syscall.UTF16PtrFromString("GooseWidgetClass")
		hinst, _, _ := modkernel32.NewProc("GetModuleHandleW").Call(0)

		wc := WNDCLASSEX{
			CbSize:        uint32(unsafe.Sizeof(WNDCLASSEX{})),
			LpfnWndProc:   syscall.NewCallback(wndProc),
			HInstance:     syscall.Handle(hinst),
			LpszClassName: className,
			HbrBackground: syscall.Handle(COLOR_WINDOW + 1),
		}

		procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

		title, _ := syscall.UTF16PtrFromString("DuckWidget")

		// Get screen dimensions
		screenWidth := int(getSystemMetrics(0))   // SM_CXSCREEN
		screenHeight := int(getSystemMetrics(1))  // SM_CYSCREEN
		
		windowWidth := 32
		windowHeight := 32
		
		// Position in bottom-right corner
		x := screenWidth - windowWidth
		y := screenHeight - windowHeight

		hwnd, _, _ := procCreateWindowExW.Call(
			WS_EX_TOPMOST|WS_EX_TOOLWINDOW|WS_EX_LAYERED,
			uintptr(unsafe.Pointer(className)),
			uintptr(unsafe.Pointer(title)),
			WS_POPUP|WS_VISIBLE,
			uintptr(x), uintptr(y), uintptr(windowWidth), uintptr(windowHeight),
			0, 0, hinst, 0,
		)

		if hwnd == 0 {
			return
		}

		// Make Magenta (0x00FF00FF) fully transparent
		procSetLayeredWindowAttributes.Call(hwnd, 0x00FF00FF, 0, LWA_COLORKEY)

		var msg MSG
		for {
			ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if ret == 0 {
				break
			}
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
		}
	}()
}