package com.anonymous.anticarsicknessrn

import android.content.Context
import java.io.PrintWriter
import java.io.StringWriter

/**
 * 崩溃现场留存。
 *
 * 这个 App 的故障形态是「点图标直接闪退」：手机不在开发者手边、
 * 又没有可连的模拟器时，用户只能说出「闪退」两个字，排查无从下手。
 * 所以把最后一次未捕获异常的堆栈存进设置存储，下次启动由界面直接显示出来，
 * 用户截图就能反馈，同时也能自己点「清除」恢复正常使用。
 *
 * 写入走 SettingsStore 的通用字符串偏好，与 JS 侧共用同一份存储和同一个读接口，
 * 不需要为崩溃上报再加一组原生方法。
 */
object CrashCapture {

    /** 与 JS 侧约定的键名：界面启动时读它，非空就显示崩溃卡片 */
    const val KEY_LAST_CRASH = "last_crash"

    private const val MAX_CHARS = 6000

    /** 在 MainApplication.onCreate 里调用（由 Config Plugin 注入） */
    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                // 必须同步落盘：紧接着进程就要被终止
                SettingsStore.setStringSync(appContext, KEY_LAST_CRASH, describe(thread, error))
            } catch (_: Exception) {
                // 存崩溃不能反过来制造新的崩溃
            }
            // 仍然交回系统默认处理（写 logcat / 上报 / 正常终止）
            previous?.uncaughtException(thread, error)
        }
    }

    private fun describe(thread: Thread, error: Throwable): String {
        val writer = StringWriter()
        error.printStackTrace(PrintWriter(writer))
        val header = "线程 ${thread.name} | ${error.javaClass.name} | ${error.message}"
        return "$header\n$writer".take(MAX_CHARS)
    }
}
