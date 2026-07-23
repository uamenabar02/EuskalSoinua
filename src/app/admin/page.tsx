"use client";

import { useEffect, useState, useCallback } from "react";
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

  // Change Passcode Form
  const [oldPasscode, setOldPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [passcodeMsg, setPasscodeMsg] = useState("");
  const [passcodeErr, setPasscodeErr] = useState("");

  // Admin Login Form
  const [loginPasscode, setLoginPasscode] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [adminInitialized, setAdminInitialized] = useState<boolean>(true);

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
          <Lock size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Admin Authentication Required</h1>
          <p className="text-xs text-textdim mt-1.5 leading-relaxed">
            Only devices synced to the administrator account (<span className="text-white font-medium">{adminEmail}</span>) can view and edit accepted/rejected devices.
          </p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-4 text-left pt-2">
          {loginErr && (
            <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 text-xs text-red-300">
              {loginErr}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-textdim mb-1">Admin Email</label>
            <input
              type="email"
              disabled
              value={adminEmail}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-neutral-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-textdim mb-1">Admin Passcode</label>
            <input
              type="password"
              required
              placeholder="Enter passcode..."
              value={loginPasscode}
              onChange={(e) => setLoginPasscode(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-accent"
            />
            {!adminInitialized && (
              <p className="text-[11px] text-accent mt-1.5 font-medium">
                First-time default passcode: <span className="font-mono underline">EuskalAdmin2026</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-accent/20 text-sm flex items-center justify-center gap-2"
          >
            <KeyRound size={18} />
            Authenticate Admin Device
          </button>
        </form>
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
              App Developer Access
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield className="text-accent" size={28} />
            Device Access Control Center
          </h1>
          <p className="text-xs text-textdim mt-1">
            Authorized Administrator: <span className="text-white font-medium">{adminEmail}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={verifyAndFetchData}
            className="bg-white/5 hover:bg-white/10 text-white font-semibold py-2 px-3.5 rounded-xl border border-white/10 text-xs flex items-center gap-2 transition-all"
          >
            <RefreshCw size={14} /> Refresh Data
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-2 transition-all"
          >
            <LogOut size={14} /> Logout Admin
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
          <span className="text-xs text-textdim font-semibold uppercase tracking-wider">Total Devices</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-white">{stats.total}</span>
            <Laptop size={20} className="text-textdim" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider">Pending Requests</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-amber-400">{stats.pending}</span>
            <Clock size={20} className="text-amber-400" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Accepted Devices</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-emerald-400">{stats.accepted}</span>
            <ShieldCheck size={20} className="text-emerald-400" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-red-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-xs text-red-400 font-semibold uppercase tracking-wider">Rejected Devices</span>
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "all" ? "bg-accent text-black shadow-lg shadow-accent/20" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            All Devices ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "pending"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            Pending ({stats.pending})
            {stats.pending > 0 && <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />}
          </button>
          <button
            onClick={() => setActiveTab("accepted")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "accepted"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            Accepted ({stats.accepted})
          </button>
          <button
            onClick={() => setActiveTab("rejected")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "rejected"
                ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            Rejected ({stats.rejected})
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "add" ? "bg-white text-black" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            <Plus size={14} /> Manual IP Add
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "settings" ? "bg-white text-black" : "bg-white/5 text-textdim hover:text-white"
            }`}
          >
            <KeyRound size={14} /> Passcode Settings
          </button>
        </div>

        {activeTab !== "settings" && activeTab !== "add" && (
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-textdim" />
            <input
              type="text"
              placeholder="Search IP, User, Location..."
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
            <Plus className="text-accent" size={20} /> Manually Add Device or IP Rule
          </h2>
          <p className="text-xs text-textdim">
            Directly whitelist or blacklist an IP address or device without waiting for a request.
          </p>

          <form onSubmit={handleAddManualDevice} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">Public IP Address *</label>
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
                <label className="block text-xs font-semibold text-textdim mb-1">User Name / Alias</label>
                <input
                  type="text"
                  placeholder="e.g. Office Router"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Device Name / Tag</label>
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
              <label className="block text-xs font-semibold text-textdim mb-1">Permission Action</label>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
              >
                <option value="accepted">Whitelist (Grant Access)</option>
                <option value="rejected">Blacklist (Permanently Block Access)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">Admin Notes</label>
              <input
                type="text"
                placeholder="Optional notes..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-accent/20"
            >
              Add Rule to Access Database
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: PASSCODE SETTINGS */}
      {activeTab === "settings" && (
        <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-xl mx-auto space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <KeyRound className="text-accent" size={20} /> Update Admin Passcode
          </h2>
          <p className="text-xs text-textdim">
            Change the master passcode used to authenticate administrator access for <span className="text-white">{adminEmail}</span>.
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
              <label className="block text-xs font-semibold text-textdim mb-1">Current Passcode</label>
              <input
                type="password"
                required
                placeholder="Enter current passcode (Default: EuskalAdmin2026)"
                value={oldPasscode}
                onChange={(e) => setOldPasscode(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textdim mb-1">New Passcode</label>
              <input
                type="password"
                required
                placeholder="At least 6 characters..."
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-accent/20"
            >
              Save New Admin Passcode
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: DEVICE LIST GRID / CARDS */}
      {activeTab !== "add" && activeTab !== "settings" && (
        <>
          {filteredRequests.length === 0 ? (
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-12 text-center text-textdim space-y-2">
              <Laptop size={40} className="mx-auto text-neutral-600 mb-2" />
              <p className="text-base font-bold text-white">No devices found</p>
              <p className="text-xs">
                {searchQuery ? `No records matching "${searchQuery}"` : `No ${activeTab} device records found.`}
              </p>
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
                      {req.status}
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
                          {req.userName || "Anonymous User"}
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
                        <span className="flex items-center gap-1"><Globe size={12} /> Public IP:</span>
                        <span className="font-mono text-white">{req.ipAddress}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1"><MapPin size={12} /> Location:</span>
                        <span className="text-white font-medium truncate max-w-[150px]">
                          {req.city ? `${req.city}, ${req.country}` : req.country || "Detected"}
                        </span>
                      </div>
                      {req.locationCoords && (
                        <div className="flex justify-between items-center text-[10px]">
                          <span>Coords:</span>
                          <span className="font-mono text-neutral-300">{req.locationCoords}</span>
                        </div>
                      )}
                    </div>

                    {req.requestNote && (
                      <p className="text-xs text-neutral-300 italic bg-white/5 p-2 rounded-xl">
                        &quot;{req.requestNote}&quot;
                      </p>
                    )}

                    {req.adminNotes && (
                      <p className="text-[11px] text-accent font-medium bg-accent/10 p-2 rounded-xl border border-accent/20">
                        Admin Note: {req.adminNotes}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    {req.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(req.deviceId, "accepted")}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.deviceId, "rejected")}
                          className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          <X size={14} /> Reject
                        </button>
                      </>
                    ) : (
                      <>
                        {req.status === "accepted" ? (
                          <button
                            onClick={() => handleUpdateStatus(req.deviceId, "rejected")}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1"
                          >
                            <X size={13} /> Revoke Access
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(req.deviceId, "accepted")}
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1"
                          >
                            <Check size={13} /> Grant Access
                          </button>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingDevice(req)}
                        className="p-2 text-textdim hover:text-white rounded-xl bg-white/5 hover:bg-white/10"
                        title="Edit Device Record"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(req.deviceId)}
                        className="p-2 text-textdim hover:text-red-400 rounded-xl bg-white/5 hover:bg-white/10"
                        title="Delete Record"
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
              <h3 className="font-bold text-lg text-white">Edit Device Details</h3>
              <button
                onClick={() => setEditingDevice(null)}
                className="text-textdim hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">User Name</label>
                <input
                  type="text"
                  value={editingDevice.userName || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, userName: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">User Email</label>
                <input
                  type="email"
                  value={editingDevice.userEmail || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, userEmail: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Device Name</label>
                <input
                  type="text"
                  value={editingDevice.deviceName || ""}
                  onChange={(e) => setEditingDevice({ ...editingDevice, deviceName: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Access Status</label>
                <select
                  value={editingDevice.status}
                  onChange={(e) => setEditingDevice({ ...editingDevice, status: e.target.value as any })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-accent"
                >
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textdim mb-1">Admin Notes</label>
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
                  className="w-1/2 bg-white/5 hover:bg-white/10 text-white font-semibold py-2.5 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-accent hover:bg-accent/90 text-black font-bold py-2.5 rounded-xl text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
