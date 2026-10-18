const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
  withGradleProperties,
} = require('@expo/config-plugins');

const DEFAULT_PACKAGE = 'com.anonymous.anticarsicknessrn';

/** 记录「本插件注入过哪些 .kt」的清单文件名，放在原生包目录下 */
const INJECTED_MANIFEST = '.overlay-injected.json';

/**
 * 清单机制引入之前（v0.1.x / v0.2.x）本插件注入过的历史文件名。
 * 老的 android/ 目录里没有清单文件，只能靠这份名单把已被删除的类清掉，
 * 否则残留的 MotionAnalyzer.kt / PredictionEngine.kt 会让 Kotlin 编译期
 * 报 unresolved reference。模板自带的 MainActivity / MainApplication 不在此列。
 */
const LEGACY_INJECTED_FILES = [
  'OverlayService.kt',
  'OverlayView.kt',
  'OverlayManager.kt',
  'OverlayModule.kt',
  'OverlayPackage.kt',
  'SensorFusion.kt',
  'MotionAnalyzer.kt',
  'PredictionEngine.kt',
];

/** 从 app.json 的 android.package 推导包名/包路径 */
function resolvePackage(config) {
  const pkg = config.android?.package || DEFAULT_PACKAGE;
  return { name: pkg, segments: pkg.split('.') };
}

/** 通知小图标（单色矢量图，随主题着色） */
const NOTIFICATION_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,2C13.1,2 14,2.9 14,4C14,5.1 13.1,6 12,6C10.9,6 10,5.1 10,4C10,2.9 10.9,2 12,2ZM8,8L8,14L5,14L5,16L8,16L8,22L10,22L10,16L14,16L14,22L16,22L16,16L19,16L19,14L16,14L16,8C16,6.9 15.1,6 14,6L10,6C8.9,6 8,6.9 8,8Z" />
</vector>
`;

/**
 * 1) 把 native/android/*.kt 复制到原生工程包目录，并把包名行改写为实际包名；
 * 2) 清理上一次注入、本次源码集里已不存在的同名文件（历史类残留会让 Kotlin 编译失败）；
 * 3) 写入通知小图标 drawable。
 * 这样即使执行 `expo prebuild --clean`，原生源码也能被重新注入。
 */
function withOverlayKotlinSources(config) {
  const { name: packageName, segments } = resolvePackage(config);

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, 'native', 'android');
      const destDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...segments
      );

      if (!fs.existsSync(sourceDir)) {
        throw new Error(`[withOverlayModule] 未找到原生源码目录: ${sourceDir}`);
      }

      // 清理陈旧注入文件：只删「本插件上次注入过、本次源码集里已不存在」的文件。
      // Expo 模板生成的 MainActivity.kt / MainApplication.kt 不在清单里，永不误删。
      const manifestPath = path.join(destDir, INJECTED_MANIFEST);
      let previous = [];
      try {
        previous = JSON.parse(
          await fs.promises.readFile(manifestPath, 'utf8')
        );
      } catch (_e) {
        previous = [];
      }

      await fs.promises.mkdir(destDir, { recursive: true });
      const files = (await fs.promises.readdir(sourceDir)).filter((f) =>
        f.endsWith('.kt')
      );

      const current = new Set(files);
      const staleCandidates = new Set([
        ...(Array.isArray(previous) ? previous : []),
        ...LEGACY_INJECTED_FILES,
      ]);
      for (const stale of staleCandidates) {
        if (!stale.endsWith('.kt') || current.has(stale)) continue;
        const target = path.join(destDir, stale);
        if (!fs.existsSync(target)) continue; // 不存在就别谎报「已清理」
        try {
          await fs.promises.rm(target, { force: true });
          console.log(`[withOverlayModule] 已清理陈旧原生文件: ${stale}`);
        } catch (e) {
          console.warn(
            `[withOverlayModule] 清理陈旧文件 ${stale} 失败: ${e.message}`
          );
        }
      }

      await Promise.all(
        files.map(async (file) => {
          const raw = await fs.promises.readFile(
            path.join(sourceDir, file),
            'utf8'
          );
          const rewritten = raw.replace(
            /^package\s+[A-Za-z0-9_.]+/m,
            `package ${packageName}`
          );
          await fs.promises.writeFile(path.join(destDir, file), rewritten);
        })
      );

      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify(files, null, 2) + '\n'
      );

      // 通知小图标：真源是 tools/icons/render.mjs 生成的 native/res/drawable/ic_stat_motion.xml
      // （与桌面图标共用同一批素描生成器）。找不到生成物时退回旧的通用符号并大声告警，
      // 而不是静默发一个「桌面是素描、通知栏是模板符号」的分裂产物。
      const drawableDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'drawable'
      );
      await fs.promises.mkdir(drawableDir, { recursive: true });

      const generatedIcon = path.join(
        projectRoot,
        'native',
        'res',
        'drawable',
        'ic_stat_motion.xml'
      );
      let iconXml = NOTIFICATION_ICON_XML;
      let iconSource = '内置回退（通用符号）';
      if (fs.existsSync(generatedIcon)) {
        const content = await fs.promises.readFile(generatedIcon, 'utf8');
        if (content.includes('<vector') && content.includes('android:pathData')) {
          iconXml = content;
          iconSource = 'native/res/drawable/ic_stat_motion.xml（素描版）';
        } else {
          console.warn(
            `[withOverlayModule] ${generatedIcon} 不像合法的 VectorDrawable，退回内置图标`
          );
        }
      } else {
        console.warn(
          `[withOverlayModule] 未找到生成的通知图标（先跑 node tools/icons/render.mjs），退回内置通用符号`
        );
      }
      await fs.promises.writeFile(
        path.join(drawableDir, 'ic_stat_motion.xml'),
        iconXml
      );
      console.log(`[withOverlayModule] 通知/磁贴图标来源：${iconSource}`);

      return cfg;
    },
  ]);
}

/**
 * 幂等地登记一个 <service> 节点。
 *
 * android:name 可能写成相对形式（".OverlayService"）也可能写成全限定形式
 * （"com.anonymous.anticarsicknessrn.OverlayService"），二者指向同一个组件。
 * 只按原始字符串去重的话，复用中的 android/ 目录里历史遗留的相对名会让我们
 * 再追加一条全限定声明 —— 实测合并后的 APK 里 OverlayService 真的出现了两次。
 * 这里按「解析后的组件名」判重，并把已有节点的写法归一为全限定形式。
 */
function ensureService(application, node, packageName) {
  const wanted = node.$['android:name'];
  const resolve = (name) => {
    if (typeof name !== 'string') return null;
    if (name.startsWith('.')) return `${packageName}${name}`;
    return name;
  };

  application.service = application.service || [];
  const matches = application.service.filter(
    (item) => resolve(item.$ && item.$['android:name']) === wanted
  );

  if (matches.length === 0) {
    application.service.push(node);
    return node;
  }

  // 归一为全限定名，并合并重复声明：清单里同一组件出现两次是无效的，
  // 复用中的 android/ 目录（未 --clean）很容易留下历史重复项
  const keep = matches[0];
  keep.$['android:name'] = wanted;
  application.service = application.service.filter(
    (item) =>
      resolve(item.$ && item.$['android:name']) !== wanted || item === keep
  );
  return keep;
}

/** 在 AndroidManifest.xml 中声明 OverlayService（specialUse 前台服务） */
function withOverlayService(config) {
  const { name: packageName } = resolvePackage(config);

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      return cfg;
    }

    const serviceName = `${packageName}.OverlayService`;
    ensureService(
      application,
      {
        $: {
          'android:name': serviceName,
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value':
                'Vehicle Motion Cues display to prevent motion sickness',
            },
          },
        ],
      },
      packageName
    );
    return cfg;
  });
}

/** 在 MainApplication.kt 注册 OverlayPackage */
function withOverlayPackage(config) {
  const { name: packageName } = resolvePackage(config);

  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    let changed = false;

    // 1) 崩溃现场留存：在 Application.onCreate 最前面装一个默认异常处理器。
    //    「点图标就闪退」且手机不在开发者手边时，这是唯一能把原因带回来的办法。
    //    必须独立判断：以前它写在「OverlayPackage 已注册就 return」之后，
    //    而复用的 android/ 目录里早就注册过了，于是这段永远不执行。
    if (!contents.includes('CrashCapture.install(this)')) {
      const withCrash = contents.replace(
        /(override fun onCreate\(\) \{[\r\n]+\s*super\.onCreate\(\)[\r\n]+)/,
        (match) => `${match}    CrashCapture.install(this)\n`
      );
      if (withCrash === contents) {
        console.warn(
          '[withOverlayModule] 未能在 MainApplication.onCreate 注入 CrashCapture.install，崩溃现场不会被留存'
        );
      } else {
        contents = withCrash;
        changed = true;
      }
    }

    // 2) 注册 OverlayPackage
    if (!contents.includes('OverlayPackage()')) {
      const ownPackageMatch = contents.match(/^package\s+([A-Za-z0-9_.]+)/m);
      const ownPackage = ownPackageMatch ? ownPackageMatch[1] : null;
      if (
        ownPackage !== packageName &&
        !contents.includes(`import ${packageName}.OverlayPackage`)
      ) {
        contents = contents.replace(
          /(^package [^\n]+\n)/m,
          `$1\nimport ${packageName}.OverlayPackage\n`
        );
      }

      const applyPattern = /(PackageList\(this\)\.packages\.apply\s*\{)/;
      if (applyPattern.test(contents)) {
        contents = contents.replace(
          applyPattern,
          `$1\n          add(OverlayPackage())`
        );
      } else {
        const listPattern = /(PackageList\(this\)\.packages)(?!\s*\.apply)/;
        if (listPattern.test(contents)) {
          contents = contents.replace(
            listPattern,
            'PackageList(this).packages.toMutableList().apply { add(OverlayPackage()) }'
          );
        } else {
          console.warn(
            '[withOverlayModule] 未能在 MainApplication.kt 中找到 getPackages()，请手动注册 OverlayPackage'
          );
        }
      }
      changed = true;
    }

    if (changed) {
      cfg.modResults.contents = contents;
    }
    return cfg;
  });
}

/** 在 AndroidManifest.xml 中声明 Quick Settings 磁贴服务 */
function withQuickSettingsTile(config) {
  const { name: packageName } = resolvePackage(config);

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      return cfg;
    }

    const tileService = {
      $: {
        'android:name': `${packageName}.MotionCueTileService`,
        // 磁贴由系统（TileServer）绑定，必须 exported + 专用权限
        'android:exported': 'true',
        'android:label': '防晕车提示',
        'android:icon': '@drawable/ic_stat_motion',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.quicksettings.action.QS_TILE',
              },
            },
          ],
        },
      ],
      // ACTIVE_TILE：点击磁贴本身即可切换，不必跳进 App
      'meta-data': [
        {
          $: {
            'android:name': 'android.service.quicksettings.ACTIVE_TILE',
            'android:value': 'true',
          },
        },
      ],
    };

    application.service = application.service || [];
    ensureService(application, tileService, packageName);
    return cfg;
  });
}

/**
 * 本机（Windows + 提权环境）构建所需的 gradle.properties 规避项。
 *
 * 这两项以前是直接手改 android/ 里的文件，于是：
 *   - 一旦 prebuild --clean 就全丢，构建又踩权限问题；
 *   - 反过来，不 clean 时它会长期滞留，让 android/ 与 app.json 悄悄漂移
 *     （实测漂移出的问题：newArchEnabled 停在 false，RN 0.85 用旧架构启动直接闪退；
 *      projectcachedir 还指向早已删除的 anti-car-sickness-rn 目录）。
 * 放进 Config Plugin 后，干净工程也能稳定带上这两项。
 */
function withLocalBuildWorkarounds(config) {
  return withGradleProperties(config, (cfg) => {
    const items = cfg.modResults;
    const setProperty = (key, value) => {
      const existing = items.find(
        (item) => item.type === 'property' && item.key === key
      );
      if (existing) {
        existing.value = String(value);
      } else {
        items.push({ type: 'property', key, value: String(value) });
      }
    };

    setProperty('kotlin.daemon.enabled', 'false');
    setProperty(
      'org.gradle.projectcachedir',
      path
        .join(cfg.modRequest.projectRoot, '.gradle-cache')
        .split(path.sep)
        .join('/')
    );

    return cfg;
  });
}

module.exports = function withOverlayModule(config) {
  config = withOverlayKotlinSources(config);
  config = withOverlayService(config);
  config = withQuickSettingsTile(config);
  config = withOverlayPackage(config);
  config = withLocalBuildWorkarounds(config);
  return config;
};
