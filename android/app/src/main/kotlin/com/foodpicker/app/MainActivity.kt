package com.foodpicker.app

import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyBestRefreshRateMode()
    }

    override fun onResume() {
        super.onResume()
        applyBestRefreshRateMode()
    }

    private fun applyBestRefreshRateMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return
        }

        val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            this.display
        } else {
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay
        } ?: return

        val modes = display.supportedModes
        if (modes.isEmpty()) {
            return
        }

        val currentMode = display.mode
        val sameResolutionModes = modes.filter {
            it.physicalWidth == currentMode.physicalWidth &&
                it.physicalHeight == currentMode.physicalHeight
        }
        val candidatePool = if (sameResolutionModes.isNotEmpty()) {
            sameResolutionModes
        } else {
            modes.toList()
        }

        val highRefreshModes = candidatePool.filter { it.refreshRate >= 90f }
        if (highRefreshModes.isEmpty()) {
            return
        }

        val bestMode = highRefreshModes.maxByOrNull { it.refreshRate } ?: return
        val attrs = window.attributes
        if (attrs.preferredDisplayModeId != bestMode.modeId) {
            attrs.preferredDisplayModeId = bestMode.modeId
            window.attributes = attrs
        }
    }
}
