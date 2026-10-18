package com.anonymous.anticarsicknessrn

import android.Manifest
import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * JS 与原生悬浮窗服务的桥接模块（name = "OverlayModule"）。
 *
 * 职责边界：设置（自动模式 / 灵敏度）只在原生 SettingsStore 里存一份，
 * JS 通过 getSettings / updateSettings 读写——因为 Quick Settings 磁贴也要读它。
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
     * 请求通知权限（Android 13+）。
     * 前台服务在没有该权限时依然能跑，但通知不可见 —— 而通知栏的「停止」
     * 是唯一不用回 App 就能关掉圆点的入口，所以值得明确请求一次。
     */
    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        val activity: Activity? = getCurrentActivity()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Android 12 及以下装了就默认有
            promise.resolve(true)
            return
        }
        if (activity == null) {
            promise.reject("ERR_NO_ACTIVITY", "当前没有可用界面，请在 App 前台时再试")
            return
        }
        try {
            val granted = androidx.core.content.ContextCompat.checkSelfPermission(
                activity, Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (granted) {
                promise.resolve(true)
            } else {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_NOTIFICATIONS
                )
                // 授权结果是异步的，这里只报「已发起请求」，由界面在回到前台时复查
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_NOTIFICATIONS", e)
        }
    }

    /** 当前用户设置（自动模式 + 灵敏度档位） */
    @ReactMethod
    fun getSettings(promise: Promise) {
        try {
            promise.resolve(toMap(SettingsStore.get(reactApplicationContext)))
        } catch (e: Exception) {
            promise.reject("ERR_GET_SETTINGS", e)
        }
    }

    /**
     * 更新设置。任一参数传 null 表示不改该项。
     * 服务正在运行时会立刻重新套用（重启前台服务并重建引擎），
     * 这样在车上也能即时生效，不用「先停再开」。
     */
    @ReactMethod
    fun updateSettings(autoMode: Boolean?, sensitivity: Double?, promise: Promise) {
        try {
            val context = reactApplicationContext
            if (autoMode != null) {
                SettingsStore.setAutoMode(context, autoMode)
            }
            if (sensitivity != null) {
                SettingsStore.setSensitivity(context, sensitivity.toFloat())
            }

            val running = OverlayService.isRunning
            if (running) {
                // 重新投递启动命令：onStartCommand 会重读设置并重建引擎
                OverlayService.start(context)
            }
            promise.resolve(toMap(SettingsStore.get(context)))
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_SETTINGS", e)
        }
    }

    /**
     * 启动前台服务并显示运动提示圆点。
     * 使用当前保存的设置（自动模式 / 灵敏度）。
     */
    @ReactMethod
    fun startService(promise: Promise) {
        val context = reactApplicationContext
        try {
            if (!Settings.canDrawOverlays(context)) {
                promise.reject("ERR_NO_PERMISSION", "缺少悬浮窗权限")
                return
            }

            OverlayService.startReason = null
            OverlayService.start(context)
            pollUntilReady(promise)
        } catch (e: Exception) {
            promise.reject("ERR_START_SERVICE", e)
        }
    }

    /** 停止前台服务并移除悬浮圆点 */
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            OverlayService.stop(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_SERVICE", e)
        }
    }

    /** 服务是否正在运行（用于界面恢复真实状态） */
    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(OverlayService.isRunning)
    }

    /** 悬浮圆点当前是否真的可见（比 isRunning 更贴近用户所见） */
    @ReactMethod
    fun isOverlayShown(promise: Promise) {
        promise.resolve(OverlayService.isRunning && OverlayService.overlayShown)
    }

    /** 当前系统是否支持「应用内请求把磁贴加到 Quick Settings」（Android 13+） */
    @ReactMethod
    fun canRequestAddTile(promise: Promise) {
        promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
    }

    /**
     * 请求把「防晕车提示」磁贴添加到 Quick Settings。
     *
     * 磁贴默认不在用户的通知栏里，需要手动拖进去；没有这个入口时，
     * 用户几乎发现不了该功能。
     *
     * 注意 API 归属：添加磁贴的入口是 [StatusBarManager.requestAddTileService]
     * （Android 13 / API 33 起），**不是** TileService 上的静态方法 ——
     * 平台 android.jar 里 TileService 根本没有 requestAddTileService。
     * 结果由系统异步回调（用户可以在确认框里取消），所以 Promise 在回调中结算。
     */
    @ReactMethod
    fun requestAddTile(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            promise.reject(
                "ERR_TILE_UNSUPPORTED",
                "当前系统版本不支持应用内添加磁贴，请在下拉快捷设置面板里长按编辑并手动拖入"
            )
            return
        }
        val context: Context = getCurrentActivity() ?: reactApplicationContext
        try {
            val manager = context.getSystemService(StatusBarManager::class.java)
            if (manager == null) {
                promise.reject("ERR_NO_STATUS_BAR_SERVICE", "系统未提供状态栏管理服务，请手动添加磁贴")
                return
            }

            val componentName = ComponentName(context, MotionCueTileService::class.java)
            val iconId = context.resources.getIdentifier(
                TILE_ICON_NAME, "drawable", context.packageName
            )
            val icon = Icon.createWithResource(
                context.packageName,
                if (iconId != 0) iconId else context.applicationInfo.icon
            )

            manager.requestAddTileService(
                componentName,
                TILE_LABEL,
                icon,
                context.mainExecutor
            ) { result: Int ->
                when (result) {
                    StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED,
                    StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED ->
                        promise.resolve(true)

                    StatusBarManager.TILE_ADD_REQUEST_ERROR_APP_NOT_IN_FOREGROUND ->
                        promise.reject("ERR_TILE_NOT_FOREGROUND", "请在 App 前台时再试一次")

                    else ->
                        promise.reject("ERR_TILE_NOT_ADDED", "未添加磁贴（系统结果码 $result）")
                }
            }
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_ADD_TILE", e)
        } catch (e: NoSuchMethodError) {
            // 个别 OEM ROM 裁剪了该 API
            promise.reject("ERR_REQUEST_ADD_TILE", e)
        }
    }

    /**
     * 读一个通用界面偏好（JS 侧的震动开关、频率等）。
     * 与 autoMode / 灵敏度共用同一份 SharedPreferences，持久化只有一套机制。
     */
    @ReactMethod
    fun getStringPref(key: String, fallback: String, promise: Promise) {
        try {
            promise.resolve(SettingsStore.getString(reactApplicationContext, key, fallback))
        } catch (e: Exception) {
            promise.reject("ERR_GET_PREF", e)
        }
    }

    @ReactMethod
    fun setStringPref(key: String, value: String, promise: Promise) {
        try {
            SettingsStore.setString(reactApplicationContext, key, value)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SET_PREF", e)
        }
    }

    private fun toMap(settings: SettingsStore.Settings): WritableMap =
        Arguments.createMap().apply {
            putBoolean("autoMode", settings.autoMode)
            putDouble("sensitivity", settings.sensitivity.toDouble())
        }

    /**
     * 服务启动是异步的：轮询到「服务在跑 + 悬浮窗真的挂上」才算成功。
     * 比固定延时更稳（慢机型冷启动超过 450ms 会被误判为失败），
     * 也能把权限被撤销 / 添加窗口失败区分为可读的原因。
     */
    private fun pollUntilReady(promise: Promise) {
        val handler = Handler(Looper.getMainLooper())
        val deadline = SystemClock.elapsedRealtime() + READY_TIMEOUT_MS
        handler.post(
            object : Runnable {
                override fun run() {
                    val reason = OverlayService.startReason
                    when {
                        OverlayService.isRunning && OverlayService.overlayShown ->
                            promise.resolve(true)

                        reason == OverlayService.REASON_PERMISSION_REVOKED ->
                            promise.reject(
                                "ERR_PERMISSION_REVOKED",
                                "悬浮窗权限已被撤销，请重新授权"
                            )

                        reason == OverlayService.REASON_OVERLAY_ADD_FAILED ->
                            promise.reject(
                                "ERR_OVERLAY_ADD_FAILED",
                                "悬浮窗添加失败，请确认已允许「显示在其他应用上层」"
                            )

                        SystemClock.elapsedRealtime() >= deadline ->
                            promise.reject(
                                "ERR_START_TIMEOUT",
                                "前台服务启动超时，请检查通知权限与系统后台运行限制"
                            )

                        else -> handler.postDelayed(this, READY_POLL_INTERVAL_MS)
                    }
                }
            }
        )
    }

    companion object {
        const val NAME = "OverlayModule"

        /** 等待服务就绪的最长时间与轮询间隔 */
        private const val READY_TIMEOUT_MS = 3000L
        private const val READY_POLL_INTERVAL_MS = 100L

        private const val REQUEST_NOTIFICATIONS = 4001

        /** 磁贴标签与图标资源名（图标由 Config Plugin 注入） */
        private const val TILE_LABEL = "防晕车提示"
        private const val TILE_ICON_NAME = "ic_stat_motion"
    }
}
