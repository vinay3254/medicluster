package com.medicluster.patient;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int PICK_PHOTO = 100;
    private static final int REQUEST_LOCATION = 101;
    private static final int REQUEST_NOTIFICATIONS = 102;
    private final NavigationPolicy policy = new NavigationPolicy(BuildConfig.PATIENT_ORIGIN);
    private WebView web;
    private LinearLayout status;
    private TextView message;
    private Button retry;
    private ProgressBar progress;
    private boolean pageFailed;
    private String lastPatientUrl = BuildConfig.PATIENT_ORIGIN + "/app";
    private ValueCallback<Uri[]> photoCallback;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(243, 241, 236));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        status = new LinearLayout(this);
        status.setOrientation(LinearLayout.VERTICAL);
        status.setGravity(Gravity.CENTER);
        status.setPadding(40, 40, 40, 40);
        status.setBackgroundColor(Color.rgb(243, 241, 236));
        progress = new ProgressBar(this);
        status.addView(progress);
        message = new TextView(this);
        message.setGravity(Gravity.CENTER);
        message.setTextSize(18);
        message.setPadding(0, 24, 0, 24);
        status.addView(message);
        retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> web.loadUrl(lastPatientUrl));
        status.addView(retry);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only user-selected gallery content.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MediClusterPatient/1.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl(), request.isForMainFrame(), request.hasGesture());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!policy.isPatientPage(url)) {
                    view.stopLoading();
                    showError();
                    return;
                }
                lastPatientUrl = url;
                pageFailed = false;
                message.setText("Connecting to your clinic…");
                progress.setVisibility(View.VISIBLE);
                retry.setVisibility(View.GONE);
                status.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed && policy.isPatientPage(url)) status.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                // Only supported report/photo types; never trust an arbitrary MIME from the page.
                java.util.Set<String> allowed=new java.util.LinkedHashSet<>();
                for (String type:params.getAcceptTypes()) for (String part:type.split(",")) {
                    String mime=part.trim().toLowerCase(java.util.Locale.ROOT);
                    if (java.util.Arrays.asList("application/pdf","image/jpeg","image/png","image/webp","image/*").contains(mime)) allowed.add(mime);
                }
                if (allowed.isEmpty()) allowed.add("image/*");
                pick.setType(allowed.size()==1?allowed.iterator().next():"*/*");
                if (allowed.size()>1) pick.putExtra(Intent.EXTRA_MIME_TYPES,allowed.toArray(new String[0]));
                try { startActivityForResult(Intent.createChooser(pick, "Choose a photo"), PICK_PHOTO); }
                catch (ActivityNotFoundException e) {
                    photoCallback.onReceiveValue(null);
                    photoCallback = null;
                    Toast.makeText(MainActivity.this, "No photo picker is available", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!policy.isTrustedOrigin(origin)) { callback.invoke(origin, false, false); return; }
                if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
                if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            }
        });
        // Always open a patient route; do not restore arbitrary external navigation from saved state.
        if (savedState != null && policy.isPatientPage(savedState.getString("patientUrl"))) {
            lastPatientUrl = savedState.getString("patientUrl");
        }
        String googleReturnUrl = consumeGoogleReturn(getIntent());
        if (googleReturnUrl != null) lastPatientUrl = googleReturnUrl;
        web.loadUrl(lastPatientUrl);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if ("com.medicluster.patient.OPEN_REMINDERS".equals(intent.getAction())) {
            lastPatientUrl=BuildConfig.PATIENT_ORIGIN+"/app";
            web.loadUrl(lastPatientUrl);
        }
        String googleReturnUrl = consumeGoogleReturn(intent);
        if (googleReturnUrl != null) {
            // Keep this WebView and its localStorage PKCE verifier when the browser returns.
            lastPatientUrl = googleReturnUrl;
            web.loadUrl(googleReturnUrl);
        }
    }

    private String consumeGoogleReturn(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri data = intent.getData();
        // Do not replay a consumed one-time code if Android recreates this activity.
        setIntent(new Intent(intent).setData(null));
        return data == null ? null : policy.patientUrlFromGoogleReturn(data.toString());
    }

    private boolean handleNavigation(Uri uri, boolean mainFrame, boolean userGesture) {
        String url = uri.toString();
        if ("mediclusterpatient".equals(uri.getScheme())) {
            if (mainFrame && policy.isPatientPage(web.getUrl())) {
                if ("mediclusterpatient://reminder-sync".equals(url)) syncReminders();
                if (userGesture && "mediclusterpatient://enable-reminders".equals(url)) enableReminders();
            }
            return true;
        }
        if (policy.isPatientPage(url)) return false;
        if (!mainFrame) return true;
        if (policy.isGoogleAuthStart(url)) {
            // Google's web OAuth flow must run in the system browser, never this WebView.
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "No browser can open Google sign-in", Toast.LENGTH_LONG).show();
            }
            return true;
        }
        String scheme = uri.getScheme();
        // Maps and phone calls leave the patient app. Staff routes on our own host stay blocked.
        boolean externalHttps = "https".equalsIgnoreCase(scheme)
                && uri.getHost() != null && uri.getUserInfo() == null
                && !Uri.parse(BuildConfig.PATIENT_ORIGIN).getHost().equalsIgnoreCase(uri.getHost());
        if (externalHttps || "tel".equalsIgnoreCase(scheme)) {
            try {
                Intent intent = new Intent("tel".equalsIgnoreCase(scheme) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, uri);
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "No app can open this link", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }

    private void publishReminderStatus(String error) {
        if (web == null || !policy.isPatientPage(web.getUrl())) return;
        String value=ReminderAlarms.status(this,error).toString();
        web.evaluateJavascript("window.MediClusterNativeReminderStatus="+value+";window.dispatchEvent(new CustomEvent('medicluster:native-reminder-status',{detail:window.MediClusterNativeReminderStatus}));",null);
    }

    private void syncReminders() {
        web.evaluateJavascript("(function(){try{var s=JSON.stringify(window.MediClusterReminderSchedule);return s&&s.length<=262144?s:null;}catch(e){return null;}})()", value -> {
            if (!policy.isPatientPage(web.getUrl())) return;
            try {
                Object decoded=new org.json.JSONTokener(value).nextValue();
                if (!(decoded instanceof String)) throw new IllegalArgumentException("Missing schedule");
                ReminderStore.save(this,(String)decoded);
                ReminderAlarms.reschedule(this);
                publishReminderStatus(null);
            } catch (Exception e) { publishReminderStatus("Could not save medicine reminders. Open medicines and try again."); }
        });
    }

    private void enableReminders() {
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            android.content.SharedPreferences preferences=getSharedPreferences("medicine-reminders",0);
            if (preferences.getBoolean("notificationsAsked",false)
                    && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName()));
            } else {
                preferences.edit().putBoolean("notificationsAsked",true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},REQUEST_NOTIFICATIONS);
            }
        } else if (!ReminderAlarms.enabled(this)) {
            startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName()));
        } else if (!ReminderAlarms.exact(this)) {
            startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
        } else {
            ReminderAlarms.reschedule(this);
            publishReminderStatus(null);
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void showError() {
        pageFailed = true;
        message.setText("Can’t connect to your clinic. Check your internet connection and try again. The server may take a minute to wake up.");
        progress.setVisibility(View.GONE);
        retry.setVisibility(View.VISIBLE);
        status.setVisibility(View.VISIBLE);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_NOTIFICATIONS) { ReminderAlarms.reschedule(this); publishReminderStatus(null); }
        if (requestCode == REQUEST_LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin, hasLocationPermission(), false);
            locationCallback = null;
            locationOrigin = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_PHOTO && photoCallback != null) {
            Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
            // File inputs receive only gallery content, never arbitrary file:// resources.
            photoCallback.onReceiveValue(selected != null && "content".equals(selected.getScheme()) ? new Uri[]{selected} : null);
            photoCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null && policy.isPatientPage(web.getUrl())) state.putString("patientUrl", web.getUrl());
        super.onSaveInstanceState(state);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onResume() {
        super.onResume();
        ReminderAlarms.reschedule(this);
        publishReminderStatus(null);
        if (web != null) {
            // Let the page recover if the browser was dismissed without a Google callback.
            web.evaluateJavascript("window.dispatchEvent(new Event('medicluster:patient-resumed'));", null);
        }
    }

    @Override protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override protected void onDestroy() {
        if (photoCallback != null) photoCallback.onReceiveValue(null);
        if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
        web.destroy();
        super.onDestroy();
    }
}
