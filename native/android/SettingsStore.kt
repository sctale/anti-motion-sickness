package com.anonymous.anticarsicknessrn

import android.content.Context

/**
 * 应用设置的单一真源（SharedPreferences）。
 *
 * 之所以放在原生层而不是 JS 侧的 AsyncStorage：
 * 1. Quick Settings 磁贴（TileService）是原生组件，必须能读到同一份 autoMode / 灵敏度，
 *    JS 存储对原生不可见；
 * 2. 悬浮服务被国产 ROM 杀掉后重启时，也要能恢复上次的设置；
 * 3. 省掉一个 npm 依赖（本项目 v0.3.0 起在刻意精简依赖）。
 *
 * JS 侧通过 OverlayModule 的 getSettings / updateSettings 读写。
 */
object SettingsStore {

    private const val PREFS_NAME = "overlay_settings"

    private const val KEY_AUTO_MODE = "auto_mode"
    private const val KEY_SENSITIVITY = "sensitivity"

    /** 默认开启自动模式（对标 Apple「自动」） */
    const val DEFAULT_AUTO_MODE = true

    /** 灵敏度档位：低 / 中 / 高，作为满行程参考输入的除数 */
    const val SENSITIVITY_LOW = 0.7f
    const val SENSITIVITY_MEDIUM = 1.0f
    const val SENSITIVITY_HIGH = 1.4f
    const val DEFAULT_SENSITIVITY = SENSITIVITY_MEDIUM

    /** 当前设置快照 */
    data class Settings(
        val autoMode: Boolean,
        val sensitivity: Float
    )

    fun get(context: Context): Settings {
        val prefs = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val sensitivity = prefs.getFloat(KEY_SENSITIVITY, DEFAULT_SENSITIVITY)
            .coerceIn(SENSITIVITY_LOW, SENSITIVITY_HIGH)
        return Settings(
            autoMode = prefs.getBoolean(KEY_AUTO_MODE, DEFAULT_AUTO_MODE),
            sensitivity = sensitivity
        )
    }

    fun setAutoMode(context: Context, autoMode: Boolean) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_AUTO_MODE, autoMode)
            .apply()
    }

    fun setSensitivity(context: Context, sensitivity: Float) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putFloat(KEY_SENSITIVITY, sensitivity.coerceIn(SENSITIVITY_LOW, SENSITIVITY_HIGH))
            .apply()
    }

    /**
     * 通用字符串设置：给 JS 侧的界面偏好（震动开关、震动频率等）用。
     * 走同一份 SharedPreferences，这样持久化只有一个机制，
     * 也不用为「记住一个开关」再引入 AsyncStorage 依赖。
     */
    fun getString(context: Context, key: String, fallback: String): String =
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(key, fallback) ?: fallback

    fun setString(context: Context, key: String, value: String) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(key, value)
            .apply()
    }
}
