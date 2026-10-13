const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
} = require('@expo/config-plugins');

const DEFAULT_PACKAGE = 'com.anonymous.anticarsicknessrn';

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
 * 2) 写入通知小图标 drawable。
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

      await fs.promises.mkdir(destDir, { recursive: true });
      const files = (await fs.promises.readdir(sourceDir)).filter((f) =>
        f.endsWith('.kt')
      );
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

      // 通知小图标
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
      await fs.promises.writeFile(
        path.join(drawableDir, 'ic_stat_motion.xml'),
        NOTIFICATION_ICON_XML
      );

      return cfg;
    },
  ]);
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
    application.service = application.service || [];
    const exists = application.service.some(
      (item) => item.$ && item.$['android:name'] === serviceName
    );
    if (exists) {
      return cfg;
    }

    application.service.push({
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
    });
    return cfg;
  });
}

/** 在 MainApplication.kt 注册 OverlayPackage */
function withOverlayPackage(config) {
  const { name: packageName } = resolvePackage(config);

  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('OverlayPackage()')) {
      return cfg;
    }

    const ownPackageMatch = contents.match(/^package\s+([A-Za-z0-9_.]+)/m);
    const ownPackage = ownPackageMatch ? ownPackageMatch[1] : null;
    if (ownPackage !== packageName && !contents.includes(`import ${packageName}.OverlayPackage`)) {
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

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withOverlayModule(config) {
  config = withOverlayKotlinSources(config);
  config = withOverlayService(config);
  config = withOverlayPackage(config);
  return config;
};
