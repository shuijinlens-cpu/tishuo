#!/usr/bin/env bash
# 给 Capacitor 生成的 Android 工程补上麦克风权限，让「录音 / 我的声音」在 APK 里可用。
# 仅在 CI 的 apk job 里、npx cap add android + cap sync 之后调用（本地无 android/ 目录，不跑）。
set -e

MANI=android/app/src/main/AndroidManifest.xml
MAIN=android/app/src/main/java/com/tishuo/app/MainActivity.java

if [ ! -f "$MANI" ]; then
  echo "未找到 $MANI，跳过（可能 cap add android 未执行）"
  exit 0
fi

# 1) AndroidManifest 加麦克风权限（Capacitor 模板默认只声明 INTERNET）
if ! grep -q RECORD_AUDIO "$MANI"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n    <application#' "$MANI"
  echo "✓ AndroidManifest 已加 RECORD_AUDIO 权限"
else
  echo "· AndroidManifest 已有 RECORD_AUDIO，跳过"
fi

# 2) 重写 MainActivity：让 WebView 的麦克风权限请求被授权（Capacitor 默认不处理 onPermissionRequest → 静默拒绝）
mkdir -p "$(dirname "$MAIN")"
cat > "$MAIN" <<'JAVA'
package com.tishuo.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge().getWebView();
    webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(new Runnable() {
          @Override
          public void run() {
            // 授权网页（WebView）请求的权限，含 RESOURCE_AUDIO_CAPTURE（麦克风）
            request.grant(request.getResources());
          }
        });
      }
    });
  }
}
JAVA
echo "✓ MainActivity 已处理 WebView 麦克风权限请求"
