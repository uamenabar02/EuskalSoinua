"use client";

import { ReactNode, useEffect, useState, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  Lock,
  Globe,
  MapPin,
  Laptop,
  CheckCircle2,
  XCircle,
  RefreshCw,
  KeyRound,
  Mail,
  User,
  Info,
} from "lucide-react";

interface AccessGateProps {
  children: ReactNode;
}

interface AccessStatusData {
  status: "accepted" | "pending" | "rejected" | "unrequested";
  isAdmin?: boolean;
  deviceId?: string;
  ipAddress?: string;
  record?: any;
  geo?: any;
  reason?: string;
  adminInitialized?: boolean;
}

export function AccessGate({ children }: AccessGateProps) {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<AccessStatusData | null>(null);

  // Form states
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Admin login states
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState("uamenabar02@gmail.com");
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  const checkStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch("/api/access/check", { cache: "no-store" });
      const data = await res.json();
      setStatusData(data);
    } catch (err) {
      console.error("Failed to check access status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAccess = async () => {
      try {
        const res = await fetch("/api/access/check", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setStatusData(data);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Failed to check access status:", err);
        if (isMounted) setLoading(false);
      }
    };

    checkAccess();

    // Active polling every 3 seconds for instant real-time access revocation or approval
    const interval = setInterval(checkAccess, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setRequestError("Please enter your name or alias.");
      return;
    }

    setSubmitting(true);
    setRequestError("");

    try {
      const deviceId = localStorage.getItem("euskalsoinua-device-id") || `dev_${Math.random().toString(36).substring(2, 11)}`;
      const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Browser Device";
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Request location if available
      let clientCoords: string | undefined = undefined;
      if (typeof navigator !== "undefined" && "geolocation" in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          clientCoords = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
        } catch (e) {
          // Geolocation permission skipped or timed out
        }
      }

      const res = await fetch("/api/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          deviceName,
          userName,
          userEmail,
          requestNote,
          clientCoords,
          clientTimezone: timezone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRequestError(data.error || "Failed to submit request.");
      } else {
        setRequestSubmitted(true);
        await checkStatus();
      }
    } catch (err: any) {
      setRequestError(err.message || "An error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasscode.trim()) {
      setAdminError("Please enter the Admin passcode.");
      return;
    }

    setAdminSubmitting(true);
    setAdminError("");

    try {
      const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
      const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Admin Browser";

      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: adminEmail,
          passcode: adminPasscode,
          deviceId,
          deviceName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAdminError(data.error || "Invalid admin credentials.");
      } else {
        setShowAdminModal(false);
        window.location.reload();
      }
    } catch (err: any) {
      setAdminError(err.message || "Login failed.");
    } finally {
      setAdminSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-textdim font-medium animate-pulse">Verifying App Access Permissions...</p>
        </div>
      </div>
    );
  }

  // Granted Access! Render the main app
  if (statusData?.status === "accepted") {
    return <>{children}</>;
  }

  const deviceId = statusData?.deviceId || "Unknown Device";
  const ipAddress = statusData?.ipAddress || "Detecting IP...";
  const geo = statusData?.geo || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="w-full max-w-lg mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-black text-sm">
            ES
          </div>
          <span className="font-bold text-lg tracking-tight">EuskalSoinua</span>
        </div>
        <button
          onClick={() => setShowAdminModal(true)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-textdim hover:text-white transition-all flex items-center gap-1.5"
        >
          <KeyRound size={14} className="text-accent" />
          Admin Login
        </button>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-lg bg-neutral-900/90 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        
        {/* CASE 1: REJECTED ACCESS */}
        {statusData?.status === "rejected" && (
          <div className="text-center space-y-5">
            <div className="mx-auto h-16 w-16 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/10">
              <XCircle size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Access Request Declined</h2>
              <p className="text-sm text-red-400 font-medium mt-1">
                This device or IP address has been rejected by the administrator.
              </p>
            </div>

            <div className="bg-red-950/40 border border-red-900/50 rounded-2xl p-4 text-left text-xs text-textdim space-y-2">
              <p className="text-red-300 font-semibold flex items-center gap-1.5">
                <ShieldAlert size={15} /> Request Status: Permanently Denied
              </p>
              <p className="leading-relaxed text-neutral-300">
                You cannot submit access requests again from this device. If you believe this is an error or you are the administrator, contact <span className="text-white font-medium">uamenabar02@gmail.com</span> or log in using the Admin passcode below.
              </p>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 text-left text-xs text-textdim space-y-1.5 border border-white/5">
              <div className="flex justify-between">
                <span>Public IP:</span>
                <span className="font-mono text-white">{ipAddress}</span>
              </div>
              <div className="flex justify-between">
                <span>Device ID:</span>
                <span className="font-mono text-white">{deviceId.substring(0, 16)}...</span>
              </div>
            </div>

            <button
              onClick={() => setShowAdminModal(true)}
              className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            >
              <KeyRound size={18} />
              Log in as Administrator (uamenabar02@gmail.com)
            </button>
          </div>
        )}

        {/* CASE 2: PENDING APPROVAL */}
        {statusData?.status === "pending" && (
          <div className="text-center space-y-5">
            <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10 animate-pulse">
              <Clock size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Access Pending Approval</h2>
              <p className="text-sm text-amber-300 font-medium mt-1">
                Your request has been sent to the admin (<span className="text-white">uamenabar02@gmail.com</span>).
              </p>
            </div>

            <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl p-4 text-left text-xs text-neutral-300 space-y-2">
              <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                <Info size={15} /> Notification Dispatched
              </p>
              <p className="leading-relaxed">
                An email alert containing your device IP (<span className="font-mono text-white">{ipAddress}</span>) and location information was sent to the app admin. You will be granted access as soon as the admin approves your request.
              </p>
            </div>

            {/* Request Summary details */}
            <div className="bg-white/5 rounded-2xl p-4 text-left text-xs space-y-2 border border-white/5 text-textdim">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><User size={13} /> Name:</span>
                <span className="text-white font-medium">{statusData.record?.userName || "Submitted"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><Globe size={13} /> Public IP:</span>
                <span className="font-mono text-white">{ipAddress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><MapPin size={13} /> Location:</span>
                <span className="text-white font-medium">
                  {statusData.record?.city ? `${statusData.record.city}, ${statusData.record.country}` : "Detected"}
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => checkStatus(true)}
                className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                Refresh Permission Status
              </button>
            </div>
          </div>
        )}

        {/* CASE 3: UNREQUESTED / NEW ACCESS REQUEST FORM */}
        {statusData?.status === "unrequested" && (
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/20 text-accent border border-accent/30 flex items-center justify-center mb-3">
                <Lock size={28} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">EuskalSoinua App Access</h2>
              <p className="text-xs text-textdim mt-1.5">
                This application requires administrator authorization (<span className="text-white font-medium">uamenabar02@gmail.com</span>) to grant device access.
              </p>
            </div>

            {requestSubmitted ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
                <h3 className="text-lg font-bold text-white">Access Request Submitted!</h3>
                <p className="text-xs text-textdim leading-relaxed">
                  The admin (<span className="text-white font-medium">uamenabar02@gmail.com</span>) was notified via email with your public IP address (<span className="font-mono text-white">{ipAddress}</span>) and localization details.
                </p>
                <button
                  onClick={() => checkStatus(true)}
                  className="w-full bg-accent text-black font-bold py-3 px-4 rounded-xl mt-2 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  Check Request Status
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-4">
                {requestError && (
                  <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2">
                    <ShieldAlert size={16} className="shrink-0 text-red-400 mt-0.5" />
                    <span>{requestError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1.5">
                    Your Name / Identifier <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-3 text-textdim" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Unai Amenabar"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-textdim focus:outline-none focus:border-accent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1.5">
                    Your Email (Optional)
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-3 text-textdim" />
                    <input
                      type="email"
                      placeholder="your.email@gmail.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-textdim focus:outline-none focus:border-accent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1.5">
                    Note / Access Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief note for administrator..."
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-textdim focus:outline-none focus:border-accent transition-all resize-none"
                  />
                </div>

                {/* Device & Localization Info Notice */}
                <div className="bg-white/5 rounded-2xl p-3.5 border border-white/5 space-y-2 text-xs text-textdim">
                  <div className="font-semibold text-white flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Globe size={14} className="text-accent" /> Connection & Localization</span>
                    <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-mono">Auto-Attached</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-neutral-400 block">Public IP:</span>
                      <span className="font-mono text-white">{ipAddress}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Location:</span>
                      <span className="text-white truncate block">{geo.city ? `${geo.city}, ${geo.country}` : "Detected"}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2 text-sm mt-2"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Submitting Request...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      Request App Access Permission
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ADMIN LOGIN MODAL */}
      {showAdminModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl max-w-md w-full p-6 text-left shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Administrator Login</h3>
                  <p className="text-xs text-textdim">App Developer Admin Access</p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-textdim hover:text-white p-1 rounded-lg bg-white/5"
              >
                ✕
              </button>
            </div>

            {!statusData?.adminInitialized && !statusData?.isAdmin && (
              <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3.5 text-xs text-accent leading-relaxed">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <Info size={14} /> First-time Admin Access Info
                </p>
                Admin Email: <span className="font-bold underline">uamenabar02@gmail.com</span><br />
                Initial Default Passcode: <span className="font-mono font-bold bg-accent/20 px-1.5 py-0.5 rounded text-white">EuskalAdmin2026</span><br />
                (You can change this passcode in Admin Settings anytime).
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              {adminError && (
                <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
                  {adminError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Admin Passcode</label>
                <input
                  type="password"
                  required
                  placeholder="Enter passcode..."
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="w-1/2 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminSubmitting}
                  className="w-1/2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-1.5"
                >
                  {adminSubmitting ? "Verifying..." : "Log In as Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
