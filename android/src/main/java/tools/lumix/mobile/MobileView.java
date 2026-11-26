package tools.lumix.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;

final class MobileView extends WebView {
    static final int PICK_FILE = 1;
    static final int SAVE_JSON = 2;

    interface RpcHandler {
        void onInvoke(String requestId, String method, String payloadJson);
    }

    private ValueCallback<Uri[]> picker;

    MobileView(Activity activity, RpcHandler rpcHandler) {
        super(activity);
        setBackgroundColor(activity.getColor(R.color.lumix_surface));
        getSettings().setJavaScriptEnabled(true);
        getSettings().setDomStorageEnabled(true);
        getSettings().setAllowFileAccess(false);
        getSettings().setAllowContentAccess(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(activity)).build();
        setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
        });
        setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result,
                                                       FileChooserParams params) {
                finishPicker(Activity.RESULT_CANCELED, null);
                picker = result;
                // CUBE and VLT have no standard Android MIME type.
                String[] accepted = params.getAcceptTypes();
                boolean audio = accepted != null && accepted.length == 1 && "audio/*".equals(accepted[0]);
                Intent choose = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType(audio ? "audio/*" : "*/*")
                        .addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    activity.startActivityForResult(choose, PICK_FILE);
                } catch (ActivityNotFoundException error) {
                    finishPicker(Activity.RESULT_CANCELED, null);
                }
                return true;
            }
        });
        addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void invoke(String requestId, String method, String payloadJson) {
                rpcHandler.onInvoke(requestId, method, payloadJson);
            }

            @JavascriptInterface
            public void readCamera() {
                rpcHandler.onInvoke("", "status", "{}");
            }
        }, "LumixAndroid");
        loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    void finishPicker(int result, Intent data) {
        if (picker == null) return;
        Uri uri = result == Activity.RESULT_OK && data != null ? data.getData() : null;
        picker.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
        picker = null;
    }

    void resolve(String requestId, JSONObject result) {
        if (requestId == null || requestId.isEmpty()) return;
        String payload = result != null ? result.toString() : "{\"ok\":false}";
        evaluateJavascript("window.__lumixResolve&&window.__lumixResolve("
                + JSONObject.quote(requestId) + "," + payload + ")", null);
    }

    void emitEvent(String eventName, JSONObject detail) {
        String payload = detail != null ? detail.toString() : "{}";
        evaluateJavascript("window.dispatchEvent(new CustomEvent("
                + JSONObject.quote(eventName) + ",{detail:" + payload + "}))", null);
    }

    @Override public void destroy() {
        finishPicker(Activity.RESULT_CANCELED, null);
        super.destroy();
    }
}
