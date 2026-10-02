"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Search,
  Filter,
  Check,
  X,
  Edit2,
  Trash2,
  Plus,
  RefreshCw,
  KeyRound,
  Globe,
  MapPin,
  Laptop,
  Mail,
  User,
  Info,
  Lock,
  LogOut,
  ArrowLeft,
  Send,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  Key,
} from "lucide-react";

interface DeviceRequest {
  id: number;
  deviceId: string;
  deviceName: string;
  userName?: string | null;
  userEmail?: string | null;
  requestNote?: string | null;
  ipAddress: string;
  country?: string | null;
  city?: string | null;
  regionName?: string | null;
  locationCoords?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  status: "pending" | "accepted" | "rejected";
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export default function AdminPage() {
  const { t } = useTranslation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState("uamenabar02@gmail.com");
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, accepted: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "accepted" | "rejected" | "add" | "settings">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Forms
  const [editingDevice, setEditingDevice] = useState<DeviceRequest | null>(null);
  const [actionSuccess, setActionSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  // Manual Add Form
  const [manualIp, setManualIp] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDevice, setManualDevice] = useState("");
  const [manualStatus, setManualStatus] = useState<"accepted" | "rejected">("accepted");
  const [manualNotes, setManualNotes] = useState("");

  // Change Passcode Form (Settings Tab)
  const [oldPasscode, setOldPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [passcodeMsg, setPasscodeMsg] = useState("");
  const [passcodeErr, setPasscodeErr] = useState("");

  // Admin Login Form
  const [loginPasscode, setLoginPasscode] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [adminInitialized, setAdminInitialized] = useState<boolean>(true);

  // Recovery Mode State (On Login Screen)
  const [loginViewMode, setLoginViewMode] = useState<"login" | "recovery_otp" | "recovery_master">("login");
  const [recoveryEmail, setRecoveryEmail] = useState("uamenabar02@gmail.com");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryNewPasscode, setRecoveryNewPasscode] = useState("");
  const [recoveryConfirmPasscode, setRecoveryConfirmPasscode] = useState("");
  const [recoveryMasterKey, setRecoveryMasterKey] = useState("");
  const [recoveryStep, setRecoveryStep] = useState<"request" | "verify">("request");
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState("");
  const [recoveryErrorMsg, setRecoveryErrorMsg] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [maskedSentEmail, setMaskedSentEmail] = useState("");

  // Settings Recovery Management
  const [masterRecoveryKey, setMasterRecoveryKey] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  const verifyAndFetchData = useCallback(async () => {
    setLoading(true);
    try {
      const authRes = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const authData = await authRes.json();
      if (authData.adminInitialized !== undefined) {
        setAdminInitialized(authData.adminInitialized);
      }

      if (authData.isAdmin) {
        setIsAdmin(true);
        setAdminEmail(authData.adminEmail || "uamenabar02@gmail.com");

        const res = await fetch("/api/access/admin", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setRequests(data.requests || []);
          setStats(data.stats || { total: 0, pending: 0, accepted: 0, rejected: 0 });
        }
      } else {
        setIsAdmin(false);
      }
    } catch (e) {
      console.error("Failed to fetch admin data:", e);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchAdminData = async () => {
      try {
        const authRes = await fetch("/api/access/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify" }),
        });
        const authData = await authRes.json();
        if (isMounted && authData.adminInitialized !== undefined) {
          setAdminInitialized(authData.adminInitialized);
        }

        if (authData.isAdmin) {
          if (isMounted) {
            setIsAdmin(true);
            setAdminEmail(authData.adminEmail || "uamenabar02@gmail.com");
          }

          const res = await fetch("/api/access/admin", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (isMounted) {
              setRequests(data.requests || []);
              setStats(data.stats || { total: 0, pending: 0, accepted: 0, rejected: 0 });
            }
          }
        } else {
          if (isMounted) setIsAdmin(false);
        }
      } catch (e) {
        console.error("Failed to fetch admin data:", e);
        if (isMounted) setIsAdmin(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAdminData();
    const interval = setInterval(fetchAdminData, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr("");
    setLoginLoading(true);
    try {
      const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
      const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Admin Device";

      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: adminEmail,
          passcode: loginPasscode,
          deviceId,
          deviceName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginErr(data.error || "Invalid admin passcode.");
      } else {
        await verifyAndFetchData();
      }
    } catch (e: any) {
      setLoginErr(e.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRequestRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryErrorMsg("");
    setRecoverySuccessMsg("");
    setRecoveryLoading(true);
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_recovery",
          email: recoveryEmail.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRecoveryErrorMsg(data.error || "Failed to request recovery code.");
      } else {
        setMaskedSentEmail(data.maskedEmail || recoveryEmail);
        if (data.simulatedOtp) {
          setRecoveryOtp(data.simulatedOtp);
          setRecoverySuccessMsg(`Verification code: ${data.simulatedOtp} (auto-filled below). In this environment, email service is offline.`);
        } else {
          setRecoverySuccessMsg(data.message || `A 6-digit recovery code has been sent to ${data.maskedEmail}.`);
        }
        setRecoveryStep("verify");
      }
    } catch (err: any) {
      setRecoveryErrorMsg(err.message || "Network error requesting recovery code.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryErrorMsg("");
    setRecoverySuccessMsg("");

    if (recoveryNewPasscode.trim().length < 6) {
      setRecoveryErrorMsg("New passcode must be at least 6 characters long.");
      return;
    }

    if (recoveryNewPasscode !== recoveryConfirmPasscode) {
      setRecoveryErrorMsg("The entered passcodes do not match.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
      const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Admin Device";

      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_recovery_otp",
          email: recoveryEmail.trim(),
          otp: recoveryOtp.trim(),
          newPasscode: recoveryNewPasscode.trim(),
          deviceId,
          deviceName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRecoveryErrorMsg(data.error || "Invalid or expired recovery code.");
      } else {
        setRecoverySuccessMsg("Passcode successfully reset! Authenticating...");
        setTimeout(async () => {
          await verifyAndFetchData();
        }, 1000);
      }
    } catch (err: any) {
      setRecoveryErrorMsg(err.message || "Failed to reset passcode.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleVerifyMasterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryErrorMsg("");
    setRecoverySuccessMsg("");

    if (!recoveryMasterKey.trim()) {
      setRecoveryErrorMsg("Please enter your Emergency Master Recovery Key.");
      return;
    }

    if (recoveryNewPasscode.trim().length < 6) {
      setRecoveryErrorMsg("New passcode must be at least 6 characters long.");
      return;
    }

    if (recoveryNewPasscode !== recoveryConfirmPasscode) {
      setRecoveryErrorMsg("The entered passcodes do not match.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
      const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Admin Device";

      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_master_key",
          masterKey: recoveryMasterKey.trim(),
          newPasscode: recoveryNewPasscode.trim(),
          deviceId,
          deviceName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRecoveryErrorMsg(data.error || "Invalid Emergency Master Recovery Key.");
      } else {
        setRecoverySuccessMsg("Passcode successfully reset via Master Key! Authenticating...");
        setTimeout(async () => {
          await verifyAndFetchData();
        }, 1000);
      }
    } catch (err: any) {
      setRecoveryErrorMsg(err.message || "Failed to reset passcode.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleGenerateMasterKey = async () => {
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_master_key" }),
      });
      const data = await res.json();
      if (res.ok && data.masterKey) {
        setMasterRecoveryKey(data.masterKey);
        setCopiedKey(false);
      }
    } catch (e) {
      console.error("Failed to generate master key:", e);
    }
  };

  const handleTestRecoveryEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailStatus("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_recovery_email" }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestEmailStatus(`Verification code (${data.otp}) generated and sent to ${adminEmail}!`);
      } else {
        setTestEmailStatus(data.error || "Failed sending test code.");
      }
    } catch (e: any) {
      setTestEmailStatus(e.message || "Failed sending test code.");
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleUpdateStatus = async (deviceId: string, status: "accepted" | "rejected" | "pending") => {
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          deviceId,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to update status.");
      } else {
        setActionSuccess(`Device status updated to ${status}.`);
        await verifyAndFetchData();
        setTimeout(() => setActionSuccess(""), 4000);
      }
    } catch (e: any) {
      setActionError(e.message || "Failed to update.");
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm("Are you sure you want to remove this device access record?")) return;
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_device",
          deviceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to delete device.");
      } else {
        setActionSuccess("Device record deleted.");
        await verifyAndFetchData();
        setTimeout(() => setActionSuccess(""), 4000);
      }
    } catch (e: any) {
      setActionError(e.message || "Failed to delete.");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_device",
          deviceId: editingDevice.deviceId,
          userName: editingDevice.userName,
          userEmail: editingDevice.userEmail,
          deviceName: editingDevice.deviceName,
          status: editingDevice.status,
          adminNotes: editingDevice.adminNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to update device.");
      } else {
        setActionSuccess("Device details updated successfully.");
        setEditingDevice(null);
        await verifyAndFetchData();
        setTimeout(() => setActionSuccess(""), 4000);
      }
    } catch (e: any) {
      setActionError(e.message || "Failed to save edit.");
    }
  };

  const handleAddManualDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp.trim()) return;
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_device",
          ipAddress: manualIp.trim(),
          userName: manualName.trim() || "Manual Add",
          deviceName: manualDevice.trim() || "Whitelisted/Blacklisted IP",
          status: manualStatus,
          adminNotes: manualNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to add manual entry.");
      } else {
        setActionSuccess(`Manual IP (${manualIp}) added to ${manualStatus} list.`);
        setManualIp("");
        setManualName("");
        setManualDevice("");
        setManualNotes("");
        setActiveTab("all");
        await verifyAndFetchData();
        setTimeout(() => setActionSuccess(""), 4000);
      }
    } catch (e: any) {
      setActionError(e.message || "Failed to add entry.");
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeErr("");
    setPasscodeMsg("");
    try {
      const res = await fetch("/api/access/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_passcode",
          oldPasscode,
          newPasscode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasscodeErr(data.error || "Failed to change passcode.");
      } else {
        setPasscodeMsg("Admin passcode updated successfully!");
        setOldPasscode("");
        setNewPasscode("");
      }
    } catch (e: any) {
      setPasscodeErr(e.message || "Error updating passcode.");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/access/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.reload();
  };

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (activeTab === "pending" && r.status !== "pending") return false;
    if (activeTab === "accepted" && r.status !== "accepted") return false;
    if (activeTab === "rejected" && r.status !== "rejected") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.userName?.toLowerCase().includes(q);
      const matchEmail = r.userEmail?.toLowerCase().includes(q);
      const matchDevice = r.deviceName?.toLowerCase().includes(q);
      const matchIp = r.ipAddress?.toLowerCase().includes(q);
      const matchCity = r.city?.toLowerCase().includes(q);
      const matchCountry = r.country?.toLowerCase().includes(q);
      return matchName || matchEmail || matchDevice || matchIp || matchCity || matchCountry;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-textdim">
        <div className="h-10 w-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Loading Device Management Dashboard...</p>
      </div>
    );
  }

  // NON-ADMIN VIEW
  if (isAdmin === false) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-neutral-900 border border-white/10 rounded-3xl text-center space-y-5 shadow-2xl">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
          {loginViewMode === "login" ? (
            <Lock size={32} />
          ) : loginViewMode === "recovery_otp" ? (
            <Mail size={32} />
          ) : (
            <Key size={32} />
          )}
        </div>

        <div>
          <h1 className="text-2xl font-black text-white">
            {loginViewMode === "login"
              ? t("admin.loginTitle")
              : loginViewMode === "recovery_otp"
              ? t("admin.recoveryModeTitle")
              : t("admin.recoveryModeTitle")}
          </h1>
          <p className="text-xs text-textdim mt-1.5 leading-relaxed">
            {loginViewMode === "login" ? (
              t("admin.loginSubtitle")
            ) : loginViewMode === "recovery_otp" ? (
              t("admin.recoveryModeDesc")
            ) : (
              t("admin.recoveryModeDesc")
            )}
          </p>
        </div>

        {/* MODE 1: STANDARD ADMIN LOGIN */}
        {loginViewMode === "login" && (
          <form onSubmit={handleAdminLogin} className="space-y-4 text-left pt-2">
            {loginErr && (
              <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
                {loginErr}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">{t("common.email")}</label>
              <input
                type="email"
                disabled
                value={adminEmail}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-neutral-400 cursor-not-allowed"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-textdim">{t("admin.oldPasscode")}</label>
                <button
                  type="button"
                  onClick={() => {
                    setLoginViewMode("recovery_otp");
                    setRecoveryStep("request");
                    setRecoveryErrorMsg("");
                    setRecoverySuccessMsg("");
                  }}
                  className="text-[11px] font-semibold text-accent hover:underline focus:outline-none cursor-pointer"
                >
                  {t("admin.recoveryModeTitle")}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  placeholder={t("admin.passcodePlaceholder")}
                  value={loginPasscode}
                  onChange={(e) => setLoginPasscode(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-3.5 pr-10 text-sm text-white focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textdim hover:text-white cursor-pointer"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {!adminInitialized && (
                <p className="text-[11px] text-textdim mt-1.5">
                  {t("admin.passcodePlaceholder")}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <KeyRound size={18} />
              {loginLoading ? t("admin.loggingIn") : t("admin.loginBtn")}
            </button>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-textdim">
              <button
                type="button"
                onClick={() => {
                  setLoginViewMode("recovery_otp");
                  setRecoveryStep("request");
                  setRecoveryErrorMsg("");
                  setRecoverySuccessMsg("");
                }}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <Mail size={13} className="text-accent" /> Recover via Email OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginViewMode("recovery_master");
                  setRecoveryErrorMsg("");
                  setRecoverySuccessMsg("");
                }}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <Key size={13} className="text-amber-400" /> Emergency Master Key
              </button>
            </div>
          </form>
        )}

        {/* MODE 2: EMAIL OTP RECOVERY */}
        {loginViewMode === "recovery_otp" && (
          <div className="text-left space-y-4 pt-1">
            {recoverySuccessMsg && (
              <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-3 text-xs text-emerald-300">
                {recoverySuccessMsg}
              </div>
            )}
            {recoveryErrorMsg && (
              <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
                {recoveryErrorMsg}
              </div>
            )}

            {recoveryStep === "request" ? (
              <form onSubmit={handleRequestRecoveryOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1">Admin Email</label>
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
                  />
                  <p className="text-[11px] text-textdim mt-1.5">
                    We will send a 6-digit one-time code valid for 15 minutes to this registered email.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 text-sm flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {recoveryLoading ? "Dispatching Code..." : "Send 6-Digit Recovery Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyRecoveryOtp} className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-xs text-textdim flex items-center justify-between">
                  <span>Code sent to: <strong className="text-white">{maskedSentEmail || recoveryEmail}</strong></span>
                  <button
                    type="button"
                    onClick={() => setRecoveryStep("request")}
                    className="text-accent hover:underline text-[11px] font-semibold"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1">6-Digit Verification Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={recoveryOtp}
                    onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-black/50 border border-accent/40 rounded-xl py-2.5 px-3.5 text-center font-mono text-xl tracking-[0.4em] text-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1">New Admin Passcode</label>
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters..."
                    value={recoveryNewPasscode}
                    onChange={(e) => setRecoveryNewPasscode(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textdim mb-1">Confirm New Passcode</label>
                  <input
                    type="password"
                    required
                    placeholder="Re-enter new passcode..."
                    value={recoveryConfirmPasscode}
                    onChange={(e) => setRecoveryConfirmPasscode(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 text-sm flex items-center justify-center gap-2"
                >
                  <KeyRound size={18} />
                  {recoveryLoading ? "Resetting Passcode..." : "Reset Passcode & Log In"}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleRequestRecoveryOtp}
                    className="text-xs text-textdim hover:text-accent transition-colors"
                  >
                    Didn&apos;t receive code? Resend
                  </button>
                </div>
              </form>
            )}

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-textdim">
              <button
                type="button"
                onClick={() => setLoginViewMode("login")}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <ArrowLeft size={13} /> Back to Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginViewMode("recovery_master");
                  setRecoveryErrorMsg("");
                  setRecoverySuccessMsg("");
                }}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <Key size={13} className="text-amber-400" /> Use Master Key
              </button>
            </div>
          </div>
        )}

        {/* MODE 3: EMERGENCY MASTER RECOVERY KEY */}
        {loginViewMode === "recovery_master" && (
          <form onSubmit={handleVerifyMasterKey} className="text-left space-y-4 pt-1">
            {recoverySuccessMsg && (
              <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-3 text-xs text-emerald-300">
                {recoverySuccessMsg}
              </div>
            )}
            {recoveryErrorMsg && (
              <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
                {recoveryErrorMsg}
              </div>
            )}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-xs text-amber-300">
              <p className="font-semibold flex items-center gap-1 mb-1">
                <AlertTriangle size={14} /> Offline Emergency Recovery
              </p>
              Enter the emergency key printed to your server terminal on initial boot or exported from Admin Settings.
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">Emergency Master Key</label>
              <input
                type="text"
                required
                placeholder="ESK-XXXX-XXXX-XXXX-XXXX"
                value={recoveryMasterKey}
                onChange={(e) => setRecoveryMasterKey(e.target.value.toUpperCase())}
                className="w-full bg-black/50 border border-amber-500/40 rounded-xl py-2.5 px-3.5 text-center font-mono text-sm tracking-wider text-amber-300 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">New Admin Passcode</label>
              <input
                type="password"
                required
                placeholder="At least 6 characters..."
                value={recoveryNewPasscode}
                onChange={(e) => setRecoveryNewPasscode(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">Confirm New Passcode</label>
              <input
                type="password"
                required
                placeholder="Re-enter new passcode..."
                value={recoveryConfirmPasscode}
                onChange={(e) => setRecoveryConfirmPasscode(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              disabled={recoveryLoading}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-amber-400/20 text-sm flex items-center justify-center gap-2"
            >
              <Key size={18} />
              {recoveryLoading ? "Resetting Passcode..." : "Reset Passcode with Master Key"}
            </button>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-textdim">
              <button
                type="button"
                onClick={() => setLoginViewMode("login")}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <ArrowLeft size={13} /> Back to Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginViewMode("recovery_otp");
                  setRecoveryStep("request");
                  setRecoveryErrorMsg("");
                  setRecoverySuccessMsg("");
                }}
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <Mail size={13} className="text-accent" /> Recover via Email OTP
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // ADMIN DASHBOARD VIEW
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest bg-accent/20 text-accent border border-accent/30 px-2.5 py-0.5 rounded-full">
              {t("admin.title")}
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield className="text-accent" size={28} />
            {t("admin.title")}
          </h1>
          <p className="text-xs text-textdim mt-1">
            {t("admin.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={verifyAndFetchData}
            className="bg-white/5 hover:bg-white/10 text-white font-semibold py-2 px-3.5 rounded-xl border border-white/10 text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw size={14} /> {t("common.refresh")}
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <LogOut size={14} /> {t("admin.logoutBtn")}
          </button>
        </div>
      </div>

      {/* Action Alerts */}
      {actionSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-2xl p-4 text-xs text-emerald-300 flex items-center gap-2">
          <ShieldCheck size={18} className="shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="bg-red-950/60 border border-red-500/50 rounded-2xl p-4 text-xs text-red-300 flex items-center gap-2">
          <ShieldAlert size={18} className="shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-textdim font-semibold uppercase tracking-wider">{t("admin.statsTotal")}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-white">{stats.total}</span>
            <Laptop size={20} className="text-textdim" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider">{t("admin.statsPending")}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-amber-400">{stats.pending}</span>
            <Clock size={20} className="text-amber-400" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">{t("admin.statsAccepted")}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-emerald-400">{stats.accepted}</span>
            <ShieldCheck size={20} className="text-emerald-400" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-red-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-red-400 font-semibold uppercase tracking-wider">{t("admin.statsRejected")}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-red-400">{stats.rejected}</span>
            <ShieldAlert size={20} className="text-red-400" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "all" ? "bg-accent text-black shadow-lg shadow-accent/20" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            {t("admin.tabsAll")} ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === "pending"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            {t("admin.tabsPending")} ({stats.pending})
            {stats.pending > 0 && <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />}
          </button>
          <button
            onClick={() => setActiveTab("accepted")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "accepted"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            {t("admin.tabsAccepted")} ({stats.accepted})
          </button>
          <button
            onClick={() => setActiveTab("rejected")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "rejected"
                ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            {t("admin.tabsRejected")} ({stats.rejected})
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === "add" ? "bg-white text-black" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            <Plus size={14} /> {t("admin.tabsAdd")}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === "settings" ? "bg-white text-black" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            <KeyRound size={14} /> {t("admin.tabsSettings")}
          </button>
        </div>

        {activeTab !== "settings" && activeTab !== "add" && (
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-textdim" />
            <input
              type="text"
              placeholder={t("admin.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-textdim focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      {/* TAB 1: MANUAL IP / DEVICE ADD */}
      {activeTab === "add" && (
        <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-xl mx-auto space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Plus className="text-accent" size={20} /> {t("admin.manualAddTitle")}
          </h2>
          <p className="text-xs text-textdim">
            {t("admin.manualAddDesc")}
          </p>

          <form onSubmit={handleAddManualDevice} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.ipAddressLabel")} *</label>
              <input
                type="text"
                required
                placeholder="e.g. 185.220.101.5"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.userNameLabel")}</label>
                <input
                  type="text"
                  placeholder="e.g. Office Router"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.deviceNameLabel")}</label>
                <input
                  type="text"
                  placeholder="e.g. Laptop IP"
                  value={manualDevice}
                  onChange={(e) => setManualDevice(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.initialStatusLabel")}</label>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="accepted">{t("admin.statusAccepted")}</option>
                <option value="rejected">{t("admin.statusRejected")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.notes")}</label>
              <input
                type="text"
                placeholder={t("admin.notes")}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-accent/20 cursor-pointer"
            >
              {t("admin.addDeviceBtn")}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: PASSCODE & SECURITY SETTINGS */}
      {activeTab === "settings" && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Section 1: Update Passcode */}
          <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 space-y-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <KeyRound className="text-accent" size={20} /> {t("admin.changePasscodeTitle")}
            </h2>
            <p className="text-xs text-textdim">
              {t("admin.subtitle")}
            </p>

            <form onSubmit={handleChangePasscode} className="space-y-4 pt-2">
              {passcodeMsg && (
                <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-3 text-xs text-emerald-300">
                  {passcodeMsg}
                </div>
              )}
              {passcodeErr && (
                <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
                  {passcodeErr}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.oldPasscode")}</label>
                <input
                  type="password"
                  required
                  placeholder={t("admin.oldPasscode")}
                  value={oldPasscode}
                  onChange={(e) => setOldPasscode(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.newPasscode")}</label>
                <input
                  type="password"
                  required
                  placeholder={t("admin.newPasscode")}
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-accent/20 cursor-pointer"
              >
                {t("admin.savePasscodeBtn")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: DEVICE LIST GRID / CARDS */}
      {activeTab !== "add" && activeTab !== "settings" && (
        <>
          {filteredRequests.length === 0 ? (
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-12 text-center text-textdim space-y-2">
              <Laptop size={40} className="mx-auto text-neutral-600 mb-2" />
              <p className="text-base font-bold text-white">{t("admin.noRequestsFound")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequests.map((req) => (
                <div
                  key={req.deviceId}
                  className={`bg-neutral-900 border rounded-3xl p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                    req.status === "pending"
                      ? "border-amber-500/40 shadow-lg shadow-amber-500/5"
                      : req.status === "accepted"
                      ? "border-emerald-500/30"
                      : "border-red-500/30 opacity-90"
                  }`}
                >
                  {/* Status Banner Tag */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                        req.status === "pending"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : req.status === "accepted"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-red-500/20 text-red-300 border-red-500/40"
                      }`}
                    >
                      {req.status === "pending" && <Clock size={12} />}
                      {req.status === "accepted" && <ShieldCheck size={12} />}
                      {req.status === "rejected" && <ShieldAlert size={12} />}
                      {req.status === "pending"
                        ? t("admin.statusPending")
                        : req.status === "accepted"
                        ? t("admin.statusAccepted")
                        : t("admin.statusRejected")}
                    </span>

                    <span className="text-[10px] text-textdim font-mono">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Device & User Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base leading-snug">
                          {req.userName || "User"}
                        </h3>
                        <p className="text-xs text-accent font-medium flex items-center gap-1">
                          <Laptop size={13} /> {req.deviceName}
                        </p>
                      </div>
                    </div>

                    {req.userEmail && (
                      <p className="text-xs text-textdim flex items-center gap-1.5">
                        <Mail size={12} /> {req.userEmail}
                      </p>
                    )}

                    {/* Localization & Connection details */}
                    <div className="bg-black/40 rounded-2xl p-3 border border-white/5 space-y-1.5 text-xs text-textdim">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1"><Globe size={12} /> {t("admin.ipAddressLabel")}:</span>
                        <span className="font-mono text-white">{req.ipAddress}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {t("common.location")}:</span>
                        <span className="text-white font-medium truncate max-w-[150px]">
                          {req.city ? `${req.city}, ${req.country}` : req.country || "Detected"}
                        </span>
                      </div>
                    </div>

                    {req.adminNotes && (
                      <p className="text-[11px] text-accent font-medium bg-accent/10 p-2 rounded-xl border border-accent/20">
                        {t("admin.notes")}: {req.adminNotes}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    {req.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(req.deviceId, "accepted")}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Check size={14} /> {t("admin.accept")}
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.deviceId, "rejected")}
                          className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <X size={14} /> {t("admin.reject")}
                        </button>
                      </>
                    ) : (
                      <>
                        {req.status === "accepted" ? (
                          <button
                            onClick={() => handleUpdateStatus(req.deviceId, "rejected")}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <X size={13} /> {t("admin.reject")}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(req.deviceId, "accepted")}
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Check size={13} /> {t("admin.accept")}
                          </button>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingDevice(req)}
                        className="p-2 text-textdim hover:text-white rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer"
                        title={t("admin.edit")}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(req.deviceId)}
                        className="p-2 text-textdim hover:text-red-400 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer"
                        title={t("admin.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* EDIT DEVICE MODAL */}
      {editingDevice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 text-left shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-white">{t("admin.deviceDetails")}</h3>
              <button
                onClick={() => setEditingDevice(null)}
                className="text-textdim hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.userNameLabel")}</label>
                <input
                  type="text"
                  value={editingDevice.userName || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, userName: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("common.email")}</label>
                <input
                  type="email"
                  value={editingDevice.userEmail || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, userEmail: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.deviceNameLabel")}</label>
                <input
                  type="text"
                  value={editingDevice.deviceName || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, deviceName: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.initialStatusLabel")}</label>
                <select
                  value={editingDevice.status}
                  onChange={(e) => setEditingDevice({ ...editingDevice, status: e.target.value as any })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="pending">{t("admin.statusPending")}</option>
                  <option value="accepted">{t("admin.statusAccepted")}</option>
                  <option value="rejected">{t("admin.statusRejected")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">{t("admin.notes")}</label>
                <input
                  type="text"
                  value={editingDevice.adminNotes || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, adminNotes: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="w-1/2 bg-white/5 hover:bg-white/10 text-white font-semibold py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-accent hover:bg-accent/90 text-black font-bold py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
