const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
} = require('@expo/config-plugins');

// 与 app.json android.package 保持一致
const PACKAGE_SEGMENTS = ['com', 'anonymous', 'anticarsicknessrn'];
const PACKAGE_NAME = PACKAGE_SEGMENTS.join('.');

/**
 * 把 native/android/*.kt 复制到原生工程包目录。
 * 这样即使执行 `expo prebuild --clean`，原生源码也能被重新注入。
 */
function withOverlayKotlinSources(config) {
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
        ...PACKAGE_SEGMENTS
      );

      if (!fs.existsSync(sourceDir)) {
        throw new Error(`[withOverlayModule] 未找到原生源码目录: ${sourceDir}`);
      }

      await fs.promises.mkdir(destDir, { recursive: true });
      const files = (await fs.promises.readdir(sourceDir)).filter((f) =>
        f.endsWith('.kt')
      );
      await Promise.all(
        files.map((file) =>
          fs.promises.copyFile(
            path.join(sourceDir, file),
            path.join(destDir, file)
          )
        )
      );
      return cfg;
    },
  ]);
}

/** 在 AndroidManifest.xml 中声明 OverlayService（specialUse 前台服务） */
function withOverlayService(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      return cfg;
    }

    const serviceName = `${PACKAGE_NAME}.OverlayService`;
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
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('OverlayPackage()')) {
      return cfg;
    }

    if (!contents.includes(`import ${PACKAGE_NAME}.OverlayPackage`)) {
      contents = contents.replace(
        /(^package [^\n]+\n)/m,
        `$1\nimport ${PACKAGE_NAME}.OverlayPackage\n`
      );
    }

    const applyPattern = /(PackageList\(this\)\.packages\.apply\s*\{)/;
    if (applyPattern.test(contents)) {
      contents = contents.replace(
        applyPattern,
        `$1\n              add(OverlayPackage())`
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
