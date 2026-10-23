package com.anonymous.anticarsicknessrn

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

/**
 * Quick Settings 磁贴：下拉通知栏一键开关防晕车圆点。
 *
 * 对标 Apple 的控制中心入口与 Google Motion Assist 的磁贴。
 *
 * Android 16 上「不好用」的根因是**刷新时机**：`getQsTile()` 只在
 * `onStartListening()`～`onStopListening()` 这段窗口里有效（面板一收就结束），
 * 而服务启动是异步的。旧实现用 `postDelayed(600ms)` 补刷一次，
 * 那时面板早就收起、`qsTile` 已是 null，补刷等于没做 ——
 * 于是「点了磁贴，图标不变，再点一次」，看起来就是坏了。
 *
 * 现在的做法：
 * 1. 点击后**立刻**按预期结果改写磁贴状态（此时仍在监听窗口内，有效）；
 * 2. 用 `TileService.requestListeningState()` 请 SystemUI 重新进入监听窗口，
 *    异步结果回来后由 `onStartListening()` 写入真实状态；
 * 3. 失败时用 Toast 给出**具体原因**（权限、系统拒绝进入前台等），不再无声。
 */
class MotionCueTileService : TileService() {

    private val handler = Handler(Looper.getMainLooper())

    /** 点击后到真实状态回来之前，磁贴先按这个走 */
    private var optimisticActive = false

    override fun onTileAdded() {
        super.onTileAdded()
        updateTile()
    }

    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    override fun onClick() {
        super.onClick()

        if (isShowingCues()) {
            OverlayService.stop(this)
            optimisticActive = false
            updateTile()
            return
        }

        if (!Settings.canDrawOverlays(this)) {
            showToast("需要先允许「显示在其他应用上层」")
            openAppForPermission()
            return
        }

        // Android 12+ 对「后台启动前台服务」有限制，磁贴点击在部分 ROM 上
        // 不一定被算作用户交互豁免；抛异常时退回「打开 App」而不是让进程崩溃
        try {
            OverlayService.start(this)
        } catch (t: Throwable) {
            showToast("无法启动：${t.message ?: "未知原因"}")
            openAppForPermission()
            return
        }

        optimisticActive = true
        updateTile()
        requestStateReconcile()
    }

    /** 圆点是否真的挂在屏幕上（比 isRunning 更接近用户所见） */
    private fun isShowingCues(): Boolean =
        OverlayService.isRunning && OverlayService.overlayShown

    private fun requestStateReconcile() {
        // 静态 API（API 24+）：请 SystemUI 重新走一次 onStartListening，
        // 我们就能在那个窗口里把异步启动后的真实状态写回磁贴
        try {
            requestListeningState(
                this,
                ComponentName(this, MotionCueTileService::class.java)
            )
        } catch (t: Throwable) {
            // 个别 ROM 不响应；下面的延时补刷在面板还开着时仍然有效
        }
        handler.postDelayed({ updateTile() }, TILE_REFRESH_DELAY_MS)
    }

    private fun updateTile() {
        val tile = qsTile ?: return
        val active = isShowingCues() || optimisticActive
        tile.state = if (active) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = LABEL
        tile.contentDescription = LABEL
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            tile.stateDescription =
                if (active) "圆点显示中，点按停止" else "点按开始显示防晕圆点"
        }
        try {
            tile.updateTile()
        } catch (t: Throwable) {
            // 监听窗口已结束（面板被收起）时会失败，忽略即可
        }
    }

    private fun showToast(text: String) {
        try {
            Toast.makeText(this, text, Toast.LENGTH_LONG).show()
        } catch (t: Throwable) {
            // 弹不出来也不能让磁贴崩掉
        }
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
        private const val LABEL = UiStrings.TILE_LABEL
        private const val REQUEST_OPEN_APP = 9001

        /** 兜底补刷（真正的刷新靠 requestListeningState → onStartListening） */
        private const val TILE_REFRESH_DELAY_MS = 800L
    }
}
