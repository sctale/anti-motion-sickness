package com.anonymous.anticarsicknessrn

import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.PixelFormat
import android.os.Build
import android.view.Gravity
import android.view.WindowManager

/**
 * 使用 WindowManager 管理 TYPE_APPLICATION_OVERLAY 系统级悬浮窗。
 * 窗口不聚焦、不接收触摸，因此不会干扰下层 App 的交互。
 */
class OverlayManager(context: Context) {

    private val appContext = context.applicationContext
    private val windowManager =
        appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var overlayView: OverlayView? = null

    /** 悬浮窗是否已添加 */
    val isShowing: Boolean
        get() = overlayView != null

    /** 添加悬浮窗（幂等）；缺少权限时返回 false */
    fun show(): Boolean {
        if (overlayView != null) return true

        val view = OverlayView(appContext)
        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            windowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        layoutParams.gravity = Gravity.TOP or Gravity.START
        // 本 App 的 Activity 锁竖屏（app.json orientation: portrait），
        // 悬浮窗若继承这个限制，横屏时窗口仍是竖屏的一条，圆点就落在屏幕中间而不是两侧。
        // 显式声明跟随传感器旋转，窗口才会随横竖屏重新量尺寸。
        layoutParams.screenOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // 横屏时刘海/挖孔在短边，不铺到 cutout 后面圆点会被切掉
            layoutParams.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            layoutParams.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        return try {
            windowManager.addView(view, layoutParams)
            overlayView = view
            true
        } catch (e: Exception) {
            // 缺少悬浮窗权限（Settings.canDrawOverlays = false）时会走到这里
            overlayView = null
            false
        }
    }

    /** 更新圆点位移与透明度（位移单位 dp，alpha 0~1） */
    fun update(offsetXdp: Float, offsetYdp: Float, alpha: Float, magnitude01: Float) {
        overlayView?.setCue(offsetXdp, offsetYdp, alpha, magnitude01)
    }

    /**
     * 息屏时暂停绘制、亮屏恢复。
     * 息屏阶段传感器已经注销，若不暂停，亮屏瞬间会先画出上一段运动的过期帧。
     */
    fun setVisible(visible: Boolean) {
        val view = overlayView ?: return
        view.post { view.setPaused(!visible) }
    }

    /** 移除悬浮窗 */
    fun hide() {
        val view = overlayView ?: return
        try {
            windowManager.removeView(view)
        } catch (_: Exception) {
            // 忽略重复移除
        }
        overlayView = null
    }

    private fun windowType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
}