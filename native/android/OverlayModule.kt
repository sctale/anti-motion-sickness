package com.anonymous.anticarsicknessrn

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS 与原生悬浮窗服务的桥接模块（name = "OverlayModule"）。
 */
class OverlayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /** 是否已授予「显示在其他应用上层」权限 */
    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        try {
            promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_PERMISSION", e)
        }
    }

    /** 跳转到系统悬浮窗授权页 */
    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + reactApplicationContext.packageName)
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_SETTINGS", e)
        }
    }

    /**
     * 启动前台服务并显示运动提示圆点。
     * @param autoMode true = 仅在检测到车辆运动时显示（对标 Apple「自动」）
     */
    @ReactMethod
    fun startService(autoMode: Boolean, promise: Promise) {
        val context = reactApplicationContext
        try {
            if (!Settings.canDrawOverlays(context)) {
                promise.reject("ERR_NO_PERMISSION", "缺少悬浮窗权限")
                return
            }

            val intent = Intent(context, OverlayService::class.java)
                .putExtra(OverlayService.EXTRA_AUTO_MODE, autoMode)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            // 启动是异步的：稍后校验服务是否真的跑起来，避免 JS 层拿到假成功
            Handler(Looper.getMainLooper()).postDelayed({
                if (OverlayService.isRunning) {
                    promise.resolve(true)
                } else {
                    promise.reject(
                        "ERR_START_FAILED",
                        "前台服务启动失败，请检查通知权限与后台运行限制"
                    )
                }
            }, START_CHECK_DELAY_MS)
        } catch (e: Exception) {
            promise.reject("ERR_START_SERVICE", e)
        }
    }

    /** 停止前台服务并移除悬浮圆点 */
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val context = reactApplicationContext
            context.stopService(Intent(context, OverlayService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_SERVICE", e)
        }
    }

    /** 服务是否正在运行（用于界面恢复真实状态） */
    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        try {
            promise.resolve(OverlayService.isRunning)
        } catch (e: Exception) {
            promise.reject("ERR_QUERY_SERVICE", e)
        }
    }

    companion object {
        const val NAME = "OverlayModule"
        private const val START_CHECK_DELAY_MS = 450L
    }
}