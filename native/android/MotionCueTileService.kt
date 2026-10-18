package com.anonymous.anticarsicknessrn

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick Settings 磁贴：下拉通知栏一键开关防晕车圆点。
 *
 * 对标 Apple 的控制中心入口与 Google Motion Assist 的 Quick Settings 磁贴 ——
 * 这是 README 对标表里长期标着「⚠️ 待实现」的那一项：
 * 没有磁贴时，用户在车上只能通过「打开 App → 点启动」来关闭圆点，
 * 而圆点本身又盖在整个屏幕上，体验上是锁死的。
 *
 * 点击直接切换服务，不启动界面；缺少悬浮窗权限时才跳回 App 引导授权。
 * 状态在每次磁贴可见（onStartListening）时刷新，这是各版本都支持的稳定做法，
 * 不依赖 API 34 才有的 TileServiceListener。
 */
class MotionCueTileService : TileService() {

    private val handler = Handler(Looper.getMainLooper())

    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    override fun onClick() {
        super.onClick()

        if (OverlayService.isRunning) {
            OverlayService.stop(this)
            updateTile()
            return
        }

        if (!Settings.canDrawOverlays(this)) {
            openAppForPermission()
            return
        }

        // Android 12+ 对「后台启动前台服务」有限制，磁贴点击在部分 ROM 上
        // 不一定被算作用户交互豁免；抛异常时退回「打开 App」而不是让进程崩溃
        try {
            OverlayService.start(this)
        } catch (e: Exception) {
            openAppForPermission()
            return
        }
        // 启动是异步的：立刻刷新只能显示「未开启」，稍后再刷一次反映真实状态
        updateTile()
        handler.postDelayed({ updateTile() }, TILE_REFRESH_DELAY_MS)
    }

    private fun updateTile() {
        val tile = qsTile ?: return
        val active = OverlayService.isRunning && OverlayService.overlayShown
        tile.state = if (active) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = LABEL
        tile.contentDescription = LABEL
        tile.updateTile()
    }

    /** 没有悬浮窗权限时，磁贴无法生效，跳回 App 让用户去授权 */
    private fun openAppForPermission() {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ 从磁贴启动界面必须走 PendingIntent 形式
                val flags = android.app.PendingIntent.FLAG_IMMUTABLE or
                    android.app.PendingIntent.FLAG_ONE_SHOT
                val pending = android.app.PendingIntent.getActivity(
                    this, REQUEST_OPEN_APP, intent, flags
                )
                @Suppress("DEPRECATION")
                startActivityAndCollapse(pending)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
        } catch (e: Exception) {
            // 极端情况（ROM 限制）下静默失败好过崩溃
            startAppFallback()
        }
    }

    private fun startAppFallback() {
        try {
            val intent = Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            @Suppress("DEPRECATION")
            startActivity(intent)
        } catch (_: Exception) {
            // 无法打开界面时不做任何事，用户仍可从桌面进入 App
        }
    }

    companion object {
        private const val LABEL = "防晕车提示"
        private const val REQUEST_OPEN_APP = 9001

        /** 点击启动后补刷一次磁贴状态的延时（服务启动是异步的） */
        private const val TILE_REFRESH_DELAY_MS = 600L
    }
}
