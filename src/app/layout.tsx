import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PlayerProvider } from "@/lib/player-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/lib/toast";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { NavDiagnostic } from "@/components/nav-diagnostic";

export const metadata: Metadata = {
  title: "EuskalSoinua — Ad-Free Music",
  description:
    "Open-source, privacy-respecting, ad-free music client. Basque-first recommendations, SponsorBlock auto-skip, on-device equalizer and recommendations.",
  manifest: "/manifest.json",
  applicationName: "EuskalSoinua",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EuskalSoinua",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: "/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Navigation logger — appends a marker on every page load so the user can
// open DevTools console and see "RELOAD" (full page load) vs "SPA" (client nav).
const navLog = `console.log('%c[EuskalSoinua] Page load','color:#1ed760;font-weight:bold','→ full browser load at',new Date().toISOString().substring(11,19));`;

// No-flash boot script: runs in <head> BEFORE React/paint. Does four things:
//   1. Applies the saved theme (no white flash).
//   2. UNREGISTERS all old service workers immediately — previous versions had
//      fetch handlers that cached stale RSC payloads and broke Next.js
//      client-side navigation (forced full-page reloads, killing the audio).
//   3. Clears all old caches.
//   4. Initializes or loads the Device Sync Key and sets the session cookie.
// This runs as early as physically possible so the old SW is destroyed before
// the user can click any navigation link.
const bootScript = `(function(){
  try{
    var t=localStorage.getItem('euskalsoinua-theme');var m={midnight:'#0a0a0f',aurora:'#0a0e1f',basque:'#140a08',forest:'#07120c',oled:'#000000',light:'#f4f4f7'};if(!t)t='midnight';document.documentElement.setAttribute('data-theme',t);var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute('content',m[t]||'#0a0a0f');
  }catch(e){}
  try{
    var k=localStorage.getItem('euskalsoinua-sync-key');
    if(!k){
      var chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var code='';
      for(var i=0;i<6;i++){
        code+=chars.charAt(Math.floor(Math.random()*chars.length));
      }
      k='S-'+code;
      localStorage.setItem('euskalsoinua-sync-key',k);
    }
    document.cookie='sync_key='+k+'; path=/; max-age=31536000; SameSite=Strict';

    var d=localStorage.getItem('euskalsoinua-device-id');
    if(!d){
      var dchars='abcdefghijklmnopqrstuvwxyz0123456789';
      var dcode='';
      for(var i=0;i<12;i++){
        dcode+=dchars.charAt(Math.floor(Math.random()*dchars.length));
      }
      d=dcode;
      localStorage.setItem('euskalsoinua-device-id',d);
    }
    document.cookie='device_id='+d+'; path=/; max-age=31536000; SameSite=Strict';

    var dn=localStorage.getItem('euskalsoinua-device-name');
    if(!dn){
      var ua=navigator.userAgent;
      var os='Unknown OS';
      if(ua.indexOf('Win')!==-1) os='Windows';
      else if(ua.indexOf('Mac')!==-1) os='macOS';
      else if(ua.indexOf('Linux')!==-1) os='Linux';
      else if(ua.indexOf('Android')!==-1) os='Android';
      else if(ua.indexOf('like Mac')!==-1) os='iOS';

      var br='Browser';
      if(ua.indexOf('Firefox')!==-1) br='Firefox';
      else if(ua.indexOf('Chrome')!==-1) br='Chrome';
      else if(ua.indexOf('Safari')!==-1) br='Safari';
      else if(ua.indexOf('Edge')!==-1) br='Edge';

      dn=br+' on '+os;
      localStorage.setItem('euskalsoinua-device-name',dn);
    }
    document.cookie='device_name='+encodeURIComponent(dn)+'; path=/; max-age=31536000; SameSite=Strict';
  }catch(e){}
  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});}).catch(function(){});
    }
    if('caches' in window){
      caches.keys().then(function(k){k.forEach(function(x){caches.delete(x);});}).catch(function(){});
    }
  }catch(e){}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="eu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: navLog }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="bg-bg text-ink antialiased min-h-dvh">
        <ThemeProvider>
          <ToastProvider>
            <PlayerProvider>
              <LayoutWrapper>{children}</LayoutWrapper>
            </PlayerProvider>
          </ToastProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <NavDiagnostic />
        {/* Capacitor native bridge (only active inside the Android app shell) */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/native-bridge.js" />
      </body>
    </html>
  );
}
