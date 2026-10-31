//go:build darwin && cgo

package main

/*
#include <stdio.h>
#include <sys/stdio.h>
#include <stdlib.h>
#include <errno.h>

static int alpha_publish_exclusive(const char *source, const char *target) {
    if (renamex_np(source, target, RENAME_EXCL) == 0) return 0;
    return errno;
}
*/
import "C"

import (
	"syscall"
	"unsafe"
)

// RENAME_EXCL comes from the platform SDK. No rename fallback may overwrite
// an existing destination, even if another process creates it after validation.
func publishExclusive(source, target string) error {
	from, to := C.CString(source), C.CString(target)
	defer C.free(unsafe.Pointer(from))
	defer C.free(unsafe.Pointer(to))
	code := syscall.Errno(C.alpha_publish_exclusive(from, to))
	if code == 0 {
		return nil
	}
	if code == syscall.EEXIST || code == syscall.ENOTEMPTY {
		return fail("OUTPUT_EXISTS", "output directory already exists")
	}
	return fail("OUTPUT_PUBLISH_FAILED", "exclusive directory publication failed")
}
