
/* =========================================
   ZONAL OPERATIONS TRACKER
   SUPABASE DATABASE INTEGRATION
========================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://hyyqjbabmyoelqhfezqk.supabase.co";

const SUPABASE_KEY = "sb_publishable_euocXYfY0SXAlIYMtVEYsA_8yntAN3t";

const dbClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
// PASSWORD RECOVERY LISTENER
dbClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
        showPasswordResetScreen();
    }
});

function showPasswordResetScreen() {
    if (document.getElementById("passwordResetOverlay")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div id="passwordResetOverlay" style="
            position:fixed; inset:0; z-index:999999;
            background:rgba(7,20,45,.72);
            display:flex; align-items:center; justify-content:center;
            padding:20px;">

            <div style="
                background:#fff; width:100%; max-width:400px;
                padding:28px; border-radius:18px;
                box-shadow:0 20px 60px rgba(0,0,0,.25);
                font-family:Arial,sans-serif;">

                <h2 style="color:#102b50;margin-top:0">
                    Reset Password
                </h2>

                <p style="color:#64748b">
                    Enter your new password below.
                </p>

                <input id="resetNewPassword" type="password"
                    placeholder="New password"
                    style="width:100%;box-sizing:border-box;padding:13px;
                    margin:10px 0;border:1px solid #ccd6e4;border-radius:9px">

                <input id="resetConfirmPassword" type="password"
                    placeholder="Confirm new password"
                    style="width:100%;box-sizing:border-box;padding:13px;
                    margin:10px 0;border:1px solid #ccd6e4;border-radius:9px">

                <button onclick="submitNewPassword()" style="
                    width:100%;padding:13px;margin-top:10px;
                    background:#1769e8;color:white;border:0;
                    border-radius:9px;font-weight:bold;cursor:pointer">
                    Update Password
                </button>

                <p id="resetPasswordMessage"
                    style="margin-top:14px;font-size:14px"></p>
            </div>
        </div>
    `);
}
async function submitNewPassword() {
    const newPassword =
        document.getElementById("resetNewPassword").value;

    const confirmPassword =
        document.getElementById("resetConfirmPassword").value;

    const message =
        document.getElementById("resetPasswordMessage");

    if (newPassword.length < 8) {
        message.style.color = "#dc2626";
        message.textContent =
            "Password must be at least 8 characters.";
        return;
    }

    if (newPassword !== confirmPassword) {
        message.style.color = "#dc2626";
        message.textContent = "Passwords do not match.";
        return;
    }

    message.style.color = "#64748b";
    message.textContent = "Updating password...";

    try {
        const { error } = await dbClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        message.style.color = "#16a34a";
        message.textContent = "Password updated successfully!";

        setTimeout(async () => {
            await dbClient.auth.signOut();

            document.getElementById("passwordResetOverlay")
                ?.remove();

            const loginScreen = document.getElementById("loginScreen");
            const app = document.getElementById("app");

            if (loginScreen) loginScreen.style.display = "flex";
            if (app) app.style.display = "none";

            showToast("Password updated. Please log in.");
        }, 1200);

    } catch (error) {
        console.error("PASSWORD RESET ERROR:", error);

        message.style.color = "#dc2626";
        message.textContent =
            error.message || "Password update failed.";
    }
}

// 2. APPLICATION STATE

let currentUser = null;
let currentProfile = null;
let currentPage = "overview";

let zonesCache = [];
let campusesCache = [];
let reportsCache = [];
let profilesCache = [];
let attendanceCache = [];
let depositCache = [];

// 3. HELPERS

const $ = id => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function formatDate(date) {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function titleCase(value) {
    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function getRoleName(role) {
    const names = {
        superadmin: "Super Admin",
        zonal: "Zonal Manager",
        assistant_zonal: "Assistant Zonal Manager",
        staff: "Campus Staff"
    };

    return names[role] || "User";
}

function isSuperAdmin() {
    return currentProfile?.role === "superadmin";
}

function isZonal() {
    return ["zonal", "assistant_zonal"].includes(
        currentProfile?.role
    );
}

function isStaff() {
    return currentProfile?.role === "staff";
}


// 4. AUTHENTICATION

async function login(event) {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const button = $("loginBtn");

    if (!email || !password) {
        showToast("Enter email and password");
        return;
    }

    button.disabled = true;
    button.textContent = "Signing In...";

    try {
        const { data, error } =
            await dbClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) throw error;

        await loadUserProfile(data.user);
        startLiveDataUpdates();

    } catch (error) {
        console.error(error);
        showToast(error.message || "Login failed");
    } finally {
        button.disabled = false;
        button.textContent = "Sign In →";
    }
}



async function loadUserProfile(authUser) {
    const { data, error } = await dbClient
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        await dbClient.auth.signOut();
        showToast("Unable to load your profile");
        return;
    }

    if (!data || !data.is_active) {
        await dbClient.auth.signOut();
        showToast("Your account is inactive or not configured");
        return;
    }

    currentUser = authUser;
    currentProfile = data;

    $("loginScreen").style.display = "none";
    $("app").style.display = "flex";

    updateUserInterface();

    await loadApplicationData();
    await goTo("overview");

    // Emergency notifications
    await loadEmergencyNotifications();
    startEmergencyNotificationUpdates();
}
async function verifyActiveSession() {
    if (!currentUser) return;

    const { data, error } = await dbClient
        .from("profiles")
        .select("is_active")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error || !data || !data.is_active) {
        await dbClient.auth.signOut();

        currentUser = null;
        currentProfile = null;

        $("app").style.display = "none";
        $("loginScreen").style.display = "flex";

        showToast("Your account is inactive. Please contact administrator.");
    }
    document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        verifyActiveSession();
    }
});

window.addEventListener("focus", () => {
    verifyActiveSession();
});
}
async function logout() {
    const { error } = await dbClient.auth.signOut();

    if (error) {
        showToast(error.message);
        return;
    }
if (emergencyChannel) {
    await dbClient.removeChannel(emergencyChannel);
    emergencyChannel = null;
}
    currentUser = null;
    currentProfile = null;

    $("app").style.display = "none";
    $("loginScreen").style.display = "flex";

    $("loginForm").reset();
    showToast("Signed out successfully");
}
async function forgotPassword() {
    const email = $("loginEmail").value.trim();
    
    if (!email) {
        showToast("Enter your registered email first");
        $("loginEmail").focus();
        return;
    }
    
    const { error } = await dbClient.auth.resetPasswordForEmail(
        email,
        {
            redirectTo: "https://praveenfx18-gif.github.io/Zot/"
        }
    );
    
    if (error) {
        showToast(error.message);
        return;
    }
    
    showToast("Password reset email sent. Check your inbox.");
}
// 5. USER INTERFACE

function updateUserInterface() {
    const name = currentProfile.full_name || "User";
    const role = getRoleName(currentProfile.role);
    const initial = name.charAt(0).toUpperCase();

    $("sidebarUserName").textContent = name;
    $("sidebarUserRole").textContent = role;
    $("userName").textContent = name;
    $("userRole").textContent = role;

    $("sidebarAvatar").textContent = initial;
    $("topbarAvatar").textContent = initial;

    $("currentDate").textContent =
        new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

    configureNavigation();
}



function configureNavigation() {
    const allowed = {
        superadmin: [
            "overview", "zones", "campuses",
            "staff", "addstaff", "reports",
            "backup", "audits", "staffmanagement",
"cashclosing"
        ],

        zonal: [
            "overview", "campuses",
            "staff", "addstaff","staffmanagement", "reports",
            "backup", "audits",
"cashclosing"
        ],

        assistant_zonal: [
    "overview", "campuses",
    "staff", "staffmanagement", "reports",
    "backup", "audits", "cashclosing"
],

        staff: [
            "overview",
            "staffattendance",
            "depositslip",
            "newreport",
            "myreports",
            "cashclosing",
            "daysheet"
        ]
    };

    const pages = allowed[currentProfile?.role] || [];

    document.querySelectorAll("[data-page]").forEach(button => {
        button.style.display =
            pages.includes(button.dataset.page) ? "flex" : "none";
    });
}

// 6. LOAD DATABASE DATA

async function loadApplicationData() {
    await Promise.all([
        loadZones(),
        loadCampuses(),
        loadProfiles(),
        loadReports(),
        loadAttendance(),
        loadDepositSlips()
    ]);
}


async function loadZones() {
    const { data, error } = await dbClient
        .from("zones")
        .select("*")
        .order("zone_name");

    if (error) {
        console.error("Zones:", error);
        zonesCache = [];
        return;
    }

    zonesCache = data || [];
}


async function loadCampuses() {
    const { data, error } = await dbClient
        .from("campuses")
        .select("*")
        .order("campus_name");

    if (error) {
        console.error("Campuses:", error);
        campusesCache = [];
        return;
    }

    campusesCache = data || [];
}


async function loadProfiles() {
    if (isStaff()) {
        profilesCache = [currentProfile];
        return;
    }

    const { data, error } = await dbClient
        .from("profiles")
        .select("*")
        .order("full_name");

    if (error) {
        console.error("Profiles:", error);
        profilesCache = [];
        return;
    }

    profilesCache = data || [];
    console.log("Profiles loaded:", profilesCache.length);
console.table(profilesCache.map(p => ({
    name: p.full_name,
    role: p.role,
    active: p.is_active
})));
}


async function loadReports() {
    let query = dbClient
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

    if (isStaff()) {
        query = query.eq("staff_id", currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Reports:", error);
        reportsCache = [];
        return;
    }

    reportsCache = data || [];
}

async function loadAttendance() {
    const role = currentProfile?.role;

    if (!["superadmin", "zonal", "assistant_zonal"].includes(role)) {
        attendanceCache = [];
        return;
    }

    const { data, error } = await dbClient
        .from("staff_attendance")
        .select(`
            *,
            staff:profiles!staff_attendance_staff_id_fkey(
                full_name,
                department
            ),
            campus:campuses!staff_attendance_campus_id_fkey(
                campus_name
            )
        `)
        .order("in_time", { ascending: false });

    if (error) {
        console.error("Attendance loading error:", error);
        attendanceCache = [];
        return;
    }

    attendanceCache = data || [];
}
// 7. PAGE NAVIGATION

async function goTo(page) {
    const allowed = {
        superadmin: [
            "overview", "zones", "campuses",
            "staff", "addstaff","reports", "backup","audits","staffmanagement","cashclosing"
        ],
        
        zonal: [
    "overview", "campuses",
    "staff", "staffmanagement","addstaff", "reports",
    "backup", "audits","cashclosing"
],
        
        assistant_zonal: [
            "overview", "campuses",
            "staff", "staffmanagement","reports", "backup","audits" ,"cashclosing"
        ],
        
        staff: [
    "overview",
    "staffattendance",
    "depositslip",
    "newreport",
    "myreports",
    "cashclosing",
    "daysheet"
]
    };
    
    if (!(allowed[currentProfile?.role] || []).includes(page)) {
        showToast("You don't have permission to open this page");
        return;
    }
    
    currentPage = page;

document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
        "active",
        button.dataset.page === page
    );
});

// CLOSE MOBILE SIDEBAR
const sidebar = $("sidebar");

if (sidebar) {
    sidebar.classList.remove("open");
}

document.body.classList.remove("sidebar-open");
    
    const titles = {
        overview: ["Overview", "Monitor your operations"],
        zones: ["Zone Management", "Manage operational zones"],
        campuses: ["Campus Management", "View campus information"],
        staff: ["Staff Management", "View staff accounts"],
        reports: ["All Reports", "Review submitted reports"],
        newreport: ["Submit Report", "Submit your daily work report"],
        myreports: ["My Reports", "View your submitted reports"],
        backup: ["Backup & Export", "Export available records"],
        staffattendance: [
            "Staff Attendance",
            "Submit your campus arrival attendance"
        ],
        depositslip: [
    "Deposit Slip",
    "Upload deposit slip and enter amounts"
],
audits: [
    "Campus Audits",
    "Upload and manage campus audit records"
],
addstaff: [
    "Add Staff",
    "Create and manage staff accounts"
],
staffmanagement: [
    "Staff Management",
    "Manage staff profiles and campus assignments"
],
cashclosing: [
    "Cash & Closing Report",
    "Submit and manage daily cash closing details"
],
daysheet: [
    "Daysheet Submission",
    "Upload your daily daysheet images"
],
    };
    
    $("pageTitle").textContent = titles[page][0];
    $("pageSubtitle").textContent = titles[page][1];
    
    const content = $("pageContent");
    content.innerHTML = `
        <div class="loading-screen">Loading...</div>
    `;
    
    if (page === "overview") renderOverview();
    if (page === "zones") renderZones();
    if (page === "campuses") renderCampuses();
    if (page === "staff") renderStaff();
    if (page === "reports") renderReports();
    if (page === "newreport") renderNewReport();
    if (page === "myreports") renderMyReports();
    if (page === "backup") renderBackup();
    
    if (page === "staffattendance") {
        renderStaffAttendance();
    }
    if (page === "depositslip") {
    renderDepositSlip();
}
if (page === "audits") {
    renderAudits();
}
if (page === "addstaff") {
    renderAddStaff();
}
if (page === "staffmanagement") {
    renderStaffManagement();
}
if (page === "cashclosing") {
    if (isStaff()) {
        renderCashClosing();
    } else {
        renderCashClosingReports();
    }
}

if (page === "daysheet") {
    renderDaysheetSubmission();
}

}

    

// 8. OVERVIEW

function renderOverview() {
    const pending = reportsCache.filter(
        report => report.status === "pending"
    ).length;

    const reviewed = reportsCache.filter(
        report => report.status === "reviewed"
    ).length;

    const returned = reportsCache.filter(
        report => report.status === "returned"
    ).length;

    const staffCount = profilesCache.filter(
        profile => profile.role === "staff"
    ).length;

    const campusCount = campusesCache.length;

    // Dashboard cards based on user role
    const cards = isStaff()
        ? [
            ["My Reports", reportsCache.length, "📋", "blue"],
            ["Pending", pending, "⏳", "orange"],
            ["Reviewed", reviewed, "✓", "green"],
            ["Returned", returned, "↩", "red"]
        ]
        : [
            ["Total Reports", reportsCache.length, "📊", "blue"],
            ["Pending Reports", pending, "⏳", "orange"],
            ["Reviewed Reports", reviewed, "✓", "green"],
            ["Staff Members", staffCount, "👥", "purple"],
            ["Total Campuses", campusCount, "🏫", "gold"]
        ];

    // Dashboard HTML

$("pageContent").innerHTML = `
    <div class="enterprise-dashboard">

        <!-- WELCOME HEADER -->
        <div class="enterprise-welcome">
            <div>
                <span class="dashboard-label">ZOT / COMMAND CENTER</span>
                <h1>Welcome back, ${escapeHTML(currentProfile.full_name)}</h1>
                <p>${escapeHTML(getRoleName(currentProfile.role))} · Operations Overview</p>
            </div>

            <div class="enterprise-date">
                <span>Today's Date</span>
                <strong>
                    ${new Date().toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    })}
                </strong>
            </div>
        </div>

        <!-- KPI CARDS -->
        <div class="enterprise-stats-grid">
            ${cards.map((card, index) => `
                <div class="enterprise-stat-card ${card[3]}"
                     style="animation-delay:${index * 100}ms">

                    <div class="enterprise-stat-top">
                        <span>${card[0]}</span>
                        <span class="enterprise-stat-icon">${card[2]}</span>
                    </div>

                    <h2 class="animated-counter"
                        data-count="${card[1]}">0</h2>

                    <div class="enterprise-stat-footer">
                        <span>Current Overview</span>
                        <span class="enterprise-status-dot"></span>
                    </div>
                </div>
            `).join("")}
        </div>

        <!-- ANALYTICS SECTION -->
        <div class="enterprise-section-title">
            <div>
                <h2>Analytics & Performance</h2>
                <p>Monitor campus activity and reporting trends</p>
            </div>
        </div>

        <div class="enterprise-chart-grid">

            <div class="enterprise-chart-card">
                <div class="enterprise-chart-heading">
                    <div>
                        <h3>Campus Performance</h3>
                        <p>Campus-wise report status overview</p>
                    </div>
                    <span class="enterprise-chart-icon">🏫</span>
                </div>

                <div class="chart-scroll-wrapper">
                    <div class="chart-fixed-size">
                        <canvas id="campusPerformanceChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="enterprise-chart-card">
                <div class="enterprise-chart-heading">
                    <div>
                        <h3>Monthly Reports Trend</h3>
                        <p>Submission and review activity</p>
                    </div>
                    <span class="enterprise-chart-icon">📈</span>
                </div>

                <div class="monthly-chart-container">
                    <canvas id="monthlyReportsChart"></canvas>
                </div>
            </div>

        </div>

        <!-- QUICK INFORMATION -->
        <div class="enterprise-bottom-heading">
            <h2>System Overview</h2>
            <p>Your centralized operations workspace</p>
        </div>

        <div class="enterprise-info-grid">
            <div class="enterprise-info-card">
                <span>🛡️</span>
                <div>
                    <strong>Secure Workspace</strong>
                    <p>Role-based access management</p>
                </div>
            </div>

            <div class="enterprise-info-card">
                <span>⚡</span>
                <div>
                    <strong>Live Operations</strong>
                    <p>Centralized reporting and monitoring</p>
                </div>
            </div>
        </div>

    </div>
`;


    // Render charts
    renderCampusPerformanceChart();
    renderMonthlyReportsChart();

    // Animate statistics counters
    document.querySelectorAll(".animated-counter").forEach(counter => {
        const target = Number(counter.dataset.count) || 0;
        const duration = 1000;
        const startTime = performance.now();

        function animate(now) {
            const progress = Math.min(
                (now - startTime) / duration,
                1
            );

            const eased = 1 - Math.pow(1 - progress, 3);

            counter.textContent = Math.floor(target * eased);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                counter.textContent = target;
            }
        }

        requestAnimationFrame(animate);
    });
}

function renderMonthlyReportsChart() {
    const canvas = $("monthlyReportsChart");

    if (!canvas || typeof Chart === "undefined") return;

    if (window.monthlyReportsChartInstance) {
        window.monthlyReportsChartInstance.destroy();
    }

    const months = [];

    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - i);

        months.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric"
            }),
            total: 0,
            reviewed: 0,
            pending: 0
        });
    }

    reportsCache.forEach(report => {
        if (!report.report_date) return;

        const parts = String(report.report_date).slice(0, 10).split("-");

        if (parts.length !== 3) return;

        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;

        const item = months.find(
            m => m.year === year && m.month === month
        );

        if (!item) return;

        item.total++;

        if (report.status === "reviewed") {
            item.reviewed++;
        }

        if (report.status === "pending") {
            item.pending++;
        }
    });

    window.monthlyReportsChartInstance = new Chart(canvas, {
        type: "line",

        data: {
            labels: months.map(m => m.label),

            datasets: [
                {
                    label: "Total Reports",
                    data: months.map(m => m.total),
                    borderColor: "#397acb",
                    backgroundColor: "rgba(57,122,203,0.12)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: "Reviewed",
                    data: months.map(m => m.reviewed),
                    borderColor: "#16a36a",
                    backgroundColor: "#16a36a",
                    tension: 0.4,
                    borderWidth: 2
                },
                {
                    label: "Pending",
                    data: months.map(m => m.pending),
                    borderColor: "#ed9b32",
                    backgroundColor: "#ed9b32",
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            animation: {
                duration: 1200,
                easing: "easeOutQuart"
            },

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        padding: 18
                    }
                }
            },

            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}


function renderCampusPerformanceChart() {
    const canvas = $("campusPerformanceChart");

    if (!canvas || typeof Chart === "undefined") return;

    if (window.campusPerformanceChartInstance) {
        window.campusPerformanceChartInstance.destroy();
    }

    const campusData = campusesCache.map(campus => {
        const campusReports = reportsCache.filter(
            report => report.campus_id === campus.id
        );

        const completed = campusReports.filter(
            report => report.status === "reviewed"
        ).length;

        const pending = campusReports.filter(
            report => report.status === "pending"
        ).length;

        return {
            name: campus.campus_name,
            completed,
            pending
        };
    });
const wrapper = canvas.closest(".chart-scroll-wrapper");
const chartContainer = canvas.parentElement;

const chartWidth = Math.max(
    campusesCache.length * 150,
    wrapper.clientWidth
);

chartContainer.style.width = chartWidth + "px";
chartContainer.style.minWidth = chartWidth + "px";
chartContainer.style.height = "360px";

canvas.style.width = "100%";
canvas.style.height = "100%";
    window.campusPerformanceChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels: campusData.map(item => item.name),
            datasets: [
                {
                    label: "Reviewed",
                    data: campusData.map(item => item.completed),
                    backgroundColor: "#16a36a",
                    borderRadius: 6
                },
                {
                    label: "Pending",
                    data: campusData.map(item => item.pending),
                    backgroundColor: "#ed9b32",
                    borderRadius: 6
                }
            ]
        },
        
options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        intersect: false,
        mode: "index"
    },
    plugins: {
        legend: {
            position: "top",
            labels: {
                usePointStyle: true,
                padding: 18
            }
        }
    },
    scales: {
        x: {
            stacked: false,
            ticks: {
                autoSkip: false,
                maxRotation: 45,
                minRotation: 45,
                font: {
                    size: 10
                }
            },
            grid: {
                display: false
            }
        },
        y: {
            beginAtZero: true,
            ticks: {
                precision: 0
            }
            
        }
    }
}

    });
    
}

// 9. ZONE MANAGEMENT

function renderZones() {
    const addForm = isSuperAdmin()
        ? `
            <div class="card">
                <h2>Add New Zone</h2>
                <form id="zoneForm">
                    <label>Zone Name</label>
                    <input name="zone_name" required
                        placeholder="Enter zone name">

                    <label>Description</label>
                    <textarea name="description"
                        placeholder="Optional description"></textarea>

                    <button type="submit">Create Zone</button>
                </form>
            </div>
        `
        : "";

    const rows = zonesCache.map(zone => `
        <tr>
            <td>${escapeHTML(zone.zone_name)}</td>
            <td>${escapeHTML(zone.description || "—")}</td>
            <td>${zone.is_active ? "Active" : "Inactive"}</td>
        </tr>
    `).join("");

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Zone Management</h1>
            <p>Manage operational zones</p>
        </div>

        ${addForm}

        <div class="card">
            <h2>Available Zones</h2>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Zone</th>
                            <th>Description</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="3">No zones found</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    $("zoneForm")?.addEventListener("submit", createZone);
}


async function createZone(event) {
    event.preventDefault();

    const form = new FormData(event.target);

    const { error } = await dbClient
        .from("zones")
        .insert({
            zone_name: form.get("zone_name").trim(),
            description: form.get("description").trim()
        });

    if (error) {
        showToast(error.message);
        return;
    }

    showToast("Zone created successfully");

    await loadZones();
    renderZones();
}


// 10. CAMPUS MANAGEMENT

function renderCampuses() {
    const addForm = isSuperAdmin()
        ? `
            <div class="card">
                <h2>Add New Campus</h2>

                <form id="campusForm">
                    <label>Campus Name</label>
                    <input name="campus_name" required
                        placeholder="Enter campus name">

                    <label>Select Zone</label>
                    <select name="zone_id" required>
                        <option value="">Select Zone</option>
                        ${zonesCache.map(zone => `
                            <option value="${escapeHTML(zone.id)}">
                                ${escapeHTML(zone.zone_name)}
                            </option>
                        `).join("")}
                    </select>

                    <label>Address</label>
                    <textarea name="address"
                        placeholder="Campus address"></textarea>

                    <button type="submit">Add Campus</button>
                </form>
            </div>
        `
        : "";

    const rows = campusesCache.map(campus => `
        <tr>
            <td>${escapeHTML(campus.campus_name)}</td>
            <td>${escapeHTML(
                zonesCache.find(z => z.id === campus.zone_id)?.zone_name || "—"
            )}</td>
            <td>${escapeHTML(campus.address || "—")}</td>
            <td>${campus.is_active ? "Active" : "Inactive"}</td>
        </tr>
    `).join("");

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Campus Management</h1>
            <p>View and manage campus information</p>
        </div>

        ${addForm}

        <div class="card">
            <h2>Campus Directory</h2>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Campus</th>
                            <th>Zone</th>
                            <th>Address</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="4">No campuses found</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    $("campusForm")?.addEventListener("submit", createCampus);
}


async function createCampus(event) {
    event.preventDefault();

    const form = new FormData(event.target);

    const { error } = await dbClient
        .from("campuses")
        .insert({
            campus_name: form.get("campus_name").trim(),
            zone_id: form.get("zone_id"),
            address: form.get("address").trim()
        });

    if (error) {
        showToast(error.message);
        return;
    }

    showToast("Campus added successfully");

    await loadCampuses();
    renderCampuses();
}


// 11. STAFF DIRECTORY
function renderStaff() {
    const staff = profilesCache.filter(
        profile => profile.role === "staff"
    );
    
    const rows = staff.map(person => {
        const campus = campusesCache.find(
            item => item.id === person.campus_id
        );
        
        const statusBadge = person.is_active ?
            `<span class="staff-status active">Active</span>` :
            `<span class="staff-status inactive">Inactive</span>`;
        
        const actionButton = isSuperAdmin() ?
            `
                <button class="btn ${person.is_active ? "btn-danger" : "btn-primary"}"
                    onclick="toggleStaffStatus('${person.id}', ${person.is_active})">
                    ${person.is_active ? "Deactivate" : "Activate"}
                </button>
            ` :
            "";
        
        return `
            <tr>
                <td>${escapeHTML(person.full_name)}</td>
                <td>${escapeHTML(person.employee_code || "—")}</td>
                <td>${escapeHTML(person.department || "—")}</td>
                <td>${escapeHTML(campus?.campus_name || "—")}</td>
                <td>${statusBadge}</td>
                <td>${actionButton}</td>
            </tr>
        `;
    }).join("");
    
    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Staff Directory</h1>
            <p>View and manage staff accounts</p>
        </div>

        <div class="card">
            <h2>Staff Members (${staff.length})</h2>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Employee Code</th>
                            <th>Department</th>
                            <th>Campus</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                ${rows || `<tr><td colspan="6">No staff records found</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
async function toggleStaffStatus(staffId, currentStatus) {
    if (!isSuperAdmin()) {
        showToast("Only Super Admin can manage staff accounts");
        return;
    }

    const newStatus = !currentStatus;
    const action = newStatus ? "activate" : "deactivate";

    if (!confirm(`Are you sure you want to ${action} this staff account?`)) {
        return;
    }

    try {
        const { error } = await dbClient
            .from("profiles")
            .update({ is_active: newStatus })
            .eq("id", staffId)
            .eq("role", "staff");

        if (error) throw error;

        showToast(`Staff account ${newStatus ? "activated" : "deactivated"} successfully`);

        await loadApplicationData();
        await goTo("staff");

    } catch (error) {
        console.error("STAFF STATUS ERROR:", error);
        showToast("Unable to update staff status: " + error.message);
    }
}

// 12. REPORT TABLE

function getReportStaffName(report) {
    return profilesCache.find(
        profile => profile.id === report.staff_id
    )?.full_name || "Staff";
}

function getReportCampusName(report) {
    return campusesCache.find(
        campus => campus.id === report.campus_id
    )?.campus_name || "—";
}


function reportsTable(reports, allowReview) {
    if (!reports.length) {
        return `<p style="padding:15px;color:#8290a5;">No reports found.</p>`;
    }

    const rows = reports.map(report => {

        const workStatus = report.work_status || "pending";
        const reviewStatus = report.status || "pending";

        const reviewButton = allowReview && reviewStatus === "pending"
            ? `
                <button type="button"
                    onclick="reviewReport('${report.id}','reviewed')">
                    Review
                </button>
                <button type="button"
                    onclick="reviewReport('${report.id}','returned')">
                    Return
                </button>
            `
            : "";

        return `
            <tr>
                <td>#${escapeHTML(report.report_number)}</td>
                <td>${escapeHTML(getReportStaffName(report))}</td>
                <td>${escapeHTML(getReportCampusName(report))}</td>
                <td>${formatDate(report.report_date)}</td>
                <td>${escapeHTML(report.work_title)}</td>

                <td>
                    <span class="badge">
                        ${escapeHTML(titleCase(workStatus))}
                    </span>
                </td>

                <td>
                    <span class="badge">
                        ${escapeHTML(titleCase(reviewStatus))}
                    </span>
                </td>

                <td>${reviewButton || "—"}</td>
            </tr>
        `;
    }).join("");

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Report ID</th>
                        <th>Staff</th>
                        <th>Campus</th>
                        <th>Date</th>
                        <th>Work</th>
                        <th>Work Status</th>
                        <th>Review Status</th>
                        <th>Action</th>
                    </tr>
                </thead>

                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

// 13. ALL REPORTS


async function renderReports() {
    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>All Reports</h1>
            <p>Select which reports you want to view</p>
        </div>

        <div class="reports-menu-grid">

            <button class="report-menu-card" onclick="openReportSection('daily')">
                <span>📋</span>
                <h3>Daily Work Reports</h3>
                <p>Staff work submissions</p>
            </button>

            <button class="report-menu-card" onclick="openReportSection('attendance')">
                <span>📅</span>
                <h3>Staff Attendance</h3>
                <p>Attendance records and photos</p>
            </button>

            <button class="report-menu-card" onclick="openReportSection('deposit')">
                <span>🧾</span>
                <h3>Deposit Slips</h3>
                <p>Deposit details and images</p>
            </button>

            <button class="report-menu-card" onclick="openReportSection('cash')">
                <span>💰</span>
                <h3>Cash & Closing</h3>
                <p>Cash closing reports</p>
            </button>

            <button class="report-menu-card" onclick="openReportSection('audits')">
                <span>📊</span>
                <h3>Campus Audits</h3>
                <p>Campus audit records</p>
            </button>

            <button class="report-menu-card" onclick="openReportSection('daysheet')">
                <span>📑</span>
                <h3>Daysheet Reports</h3>
                <p>Daysheet image submissions</p>
            </button>

        </div>
    `;
}

async function renderCashClosingRecords() {
    const container = $("cashClosingRecordsContainer");

    if (!container) {
        console.error("Cash Closing container not found");
        return;
    }

    try {
        // 1. FETCH CASH CLOSING REPORTS
        const { data, error } = await dbClient
            .from("cash_closing_reports")
            .select("*")
            .order("report_date", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML =
                "<p>No Cash & Closing Reports submitted yet.</p>";
            return;
        }

        // 2. GET UNIQUE CAMPUS AND STAFF IDS
        const campusIds = [
            ...new Set(data.map(r => r.campus_id).filter(Boolean))
        ];

        const staffIds = [
            ...new Set(data.map(r => r.staff_id).filter(Boolean))
        ];

        // 3. FETCH CAMPUS NAMES
        const { data: campuses, error: campusError } = await dbClient
            .from("campuses")
            .select("id, campus_name")
            .in("id", campusIds);

        if (campusError) throw campusError;

        // 4. FETCH STAFF NAMES
        const { data: staffMembers, error: staffError } = await dbClient
            .from("profiles")
            .select("id, full_name")
            .in("id", staffIds);

        if (staffError) throw staffError;

        // 5. CREATE LOOKUP MAPS
        const campusMap = Object.fromEntries(
            (campuses || []).map(c => [c.id, c.campus_name])
        );

        const staffMap = Object.fromEntries(
            (staffMembers || []).map(s => [s.id, s.full_name])
        );

        // 6. DISPLAY REPORT TABLE
        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Staff</th>
                            <th>Campus</th>
                            <th>Day Sheet</th>
                            <th>Pocket Closing</th>
                            <th>Cash Payment</th>
                            <th>Card Payment</th>
                            <th>Pocket Balance</th>
                            <th>Expenditure Balance</th>
                            <th>JR's</th>
                            <th>SR's</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${data.map(report => {
                            const staffName =
                                staffMap[report.staff_id] || "Staff";

                            const campusName =
                                campusMap[report.campus_id] || "Campus not found";

                            return `
                                <tr>
                                    <td>${escapeHTML(report.report_date || "")}</td>

                                    <td>${escapeHTML(staffName)}</td>

                                    <td>${escapeHTML(campusName)}</td>

                                    <td>
                                        ${report.day_sheet_status === "yes" ? "Yes" : "No"}
                                        ${report.day_sheet_reason
                                            ? `<br><small>${escapeHTML(report.day_sheet_reason)}</small>`
                                            : ""}
                                    </td>

                                    <td>
                                        ${report.pocket_money_closing_status === "yes" ? "Yes" : "No"}
                                        ${report.pocket_money_closing_reason
                                            ? `<br><small>${escapeHTML(report.pocket_money_closing_reason)}</small>`
                                            : ""}
                                    </td>

                                    <td>₹${Number(report.cash_payment || 0).toLocaleString("en-IN")}</td>

                                    <td>₹${Number(report.card_payment || 0).toLocaleString("en-IN")}</td>

                                    <td>₹${Number(report.pocket_money_balance || 0).toLocaleString("en-IN")}</td>

                                    <td>₹${Number(report.expenditure_balance || 0).toLocaleString("en-IN")}</td>

                                    <td>${report.jr_students ?? "-"}</td>

                                    <td>${report.sr_students ?? "-"}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {
        console.error("CASH CLOSING REPORT LOAD ERROR:", error);

        container.innerHTML = `
            <p style="color:#dc2626">
                Unable to load Cash & Closing Reports:
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

async function openReportSection(section) {

    const content = $("pageContent");

    const headings = {
        daily: ["Daily Work Reports", "Staff work submissions"],
        attendance: ["Staff Attendance", "Attendance records"],
        deposit: ["Deposit Slips", "Staff deposit submissions"],
        cash: ["Cash & Closing Reports", "Daily cash closing records"],
        audits: ["Campus Audits", "Campus audit records"],
        daysheet: ["Daysheet Reports", "Daysheet image submissions"]
    };

    if (!headings[section]) return;

    content.innerHTML = `
        <div class="page-heading">
            <button class="secondary-btn" onclick="renderReports()">
                ← Back to All Reports
            </button>
            <h1>${headings[section][0]}</h1>
            <p>${headings[section][1]}</p>
        </div>
        <div id="selectedReportContent">
            <div class="loading-screen">Loading...</div>
        </div>
    `;

    const target = $("selectedReportContent");

    if (section === "daily") {
        target.innerHTML = `
            <div class="card">
                <h2>Excel Reports Download</h2>
                <p>Download all reports or select a date range.</p>

                <div class="export-date-fields">
                    <div>
                        <label>From Date</label>
                        <input type="date" id="exportFromDate">
                    </div>
                    <div>
                        <label>To Date</label>
                        <input type="date" id="exportToDate">
                    </div>
                </div>

                <div class="export-buttons">
                    <button onclick="downloadAllReportsExcel()">
                        Download All Reports
                    </button>
                    <button onclick="downloadDateWiseExcel()">
                        Download Date-wise Excel
                    </button>
                </div>
            </div>

            <div class="card">
                <h2>Daily Work Reports (${reportsCache.length})</h2>
                ${reportsTable(reportsCache, true)}
            </div>
        `;
    }

    else if (section === "attendance") {
        target.innerHTML = `
            <div class="card">
                <h2>Staff Attendance (${attendanceCache.length})</h2>
                <p>Campus arrival time and submitted photos.</p>
                <div id="attendanceRecordsContainer">
                    Loading attendance...
                </div>
            </div>
        `;
        await renderAttendanceSection();
    }

    else if (section === "deposit") {
        target.innerHTML = `
            <div class="card">
                <h2>Deposit Slips (${depositCache.length})</h2>
                <p>Staff deposit submissions and amount details.</p>
                <div id="depositRecordsContainer">
                    Loading deposit slips...
                </div>
            </div>
        `;
        await renderDepositSection();
    }

    else if (section === "cash") {
        target.innerHTML = `
            <div class="card">
                <h2>Cash & Closing Reports</h2>

                <div class="cash-closing-export-buttons">
                    <button onclick="downloadCashClosingExcel()">
                        Download Excel
                    </button>
                    <button onclick="downloadCashClosingPDF()">
                        Download PDF
                    </button>
                </div>

                <div id="cashClosingRecordsContainer">
                    Loading cash closing reports...
                </div>
            </div>
        `;
        await renderCashClosingRecords();
    }

    else if (section === "audits") {
    target.innerHTML = `
        <div class="page-heading">
            <button class="secondary-btn"
                onclick="renderReports()">
                ← Back to All Reports
            </button>
            <h1>Campus Audits</h1>
            <p>Campus audit records</p>
        </div>

        <div id="auditsContent">
            <div class="loading-screen">Loading...</div>
        </div>
    `;
    
    await renderAudits();
}
    

 
else if (section === "daysheet") {
    target.innerHTML = `
        <div class="card">
            <h2>Daysheet Reports</h2>
            <p>Submitted daysheet images and staff details.</p>

            <div class="daysheet-export-buttons">
                <button class="btn btn-primary"
                        onclick="downloadDaysheetExcel()">
                    Download Excel
                </button>

                <button class="btn btn-primary"
                        onclick="downloadDaysheetPDF()">
                    Download PDF
                </button>
            </div>

            <div id="daysheetRecordsContainer">
                <div class="loading-screen">Loading daysheets...</div>
            </div>
        </div>
    `;
    
    await renderDaysheetReports();
}
}


// 14. REVIEW REPORT

async function reviewReport(reportId, status) {
    if (!isSuperAdmin() && !isZonal()) {
        showToast("You are not allowed to review reports");
        return;
    }

    const remarks = prompt(
        status === "returned"
            ? "Enter reason for returning this report:"
            : "Optional review remarks:"
    );

    if (remarks === null) return;

    const { error } = await dbClient
        .from("reports")
        .update({
            status,
            remarks,
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq("id", reportId);

    if (error) {
        showToast(error.message);
        return;
    }

    showToast("Report status updated");

    await loadReports();

    if (currentPage === "reports") renderReports();
    if (currentPage === "overview") renderOverview();
}


// 15. NEW REPORT FORM

function renderNewReport() {
    if (!currentProfile.campus_id) {
        $("pageContent").innerHTML = `
            <div class="card">
                <h2>Campus not assigned</h2>
                <p>Please contact your administrator.</p>
            </div>
        `;
        return;
    }

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Submit Daily Report</h1>
            <p>Enter your work details below</p>
        </div>

        <div class="card">
            <form id="reportForm">

                <label>Report Date</label>
                <input type="date" name="report_date"
                    value="${new Date().toISOString().slice(0, 10)}"
                    required>

                <label>Work Title</label>
                <input name="work_title"
                    placeholder="Enter work title" required>

                <label>Work Description</label>
                <textarea name="work_description"
                    rows="5"
                    placeholder="Describe your work"
                    required></textarea>

                <label>Start Time</label>
                <input type="time" name="start_time">

                <label>End Time</label>
                <input type="time" name="end_time">

                <label>Work Status</label>
                <select name="work_status" required>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                </select>

                <label>Remarks</label>
                <textarea name="remarks"
                    rows="3"
                    placeholder="Optional remarks"></textarea>

                <button type="submit">Submit Report →</button>

            </form>
        </div>
    `;

    $("reportForm").addEventListener("submit", submitReport);
}


// SUBMIT REPORT

async function submitReport(event) {
    event.preventDefault();

    const form = new FormData(event.target);

    const report = {
        staff_id: currentUser.id,
        campus_id: currentProfile.campus_id,
        report_date: form.get("report_date"),
        work_title: form.get("work_title").trim(),
        work_description: form.get("work_description").trim(),
        start_time: form.get("start_time") || null,
        end_time: form.get("end_time") || null,

        // Staff selected work status
        work_status: form.get("work_status"),

        // Zonal review status remains separate
        status: "pending",

        remarks: form.get("remarks").trim() || null
    };

    const { error } = await dbClient
        .from("reports")
        .insert(report);

    if (error) {
        showToast(error.message);
        console.error("REPORT SUBMISSION ERROR:", error);
        return;
    }

    showToast("Report submitted successfully");

    await loadReports();
    await goTo("myreports");
}

// 16. MY REPORTS

function renderMyReports() {
    const myReports = reportsCache.filter(
        report => report.staff_id === currentUser.id
    );

    const rows = myReports.map(report => `
        <tr>
            <td>#${escapeHTML(report.report_number)}</td>
            <td>${formatDate(report.report_date)}</td>
            <td>${escapeHTML(report.work_title)}</td>
            <td>${escapeHTML(titleCase(report.work_status || "pending"))}</td>
            <td>${escapeHTML(report.remarks || "—")}</td>
        </tr>
    `).join("");

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>My Reports</h1>
            <p>Track your submitted work reports</p>
        </div>

        <div class="card">
            <h2>My Submissions (${myReports.length})</h2>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Report ID</th>
                            <th>Date</th>
                            <th>Work Title</th>
                            <th>Status</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="5">No reports submitted yet</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}


// 17. BACKUP & EXPORT

// 17. BACKUP & EXPORT

function renderBackup() {
    if (!isSuperAdmin() && !isZonal()) {
        showToast("Access denied");
        return;
    }
    
    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Backup & Export</h1>
            <p>Weekly database and storage backup</p>
        </div>

        <div class="card">
            <h2>Weekly Complete Backup</h2>

            <p style="color:#8290a5;font-size:13px;">
                Download accessible database records and storage files
                together as one ZIP file.
            </p>

            <button type="button" id="completeBackupBtn">
                Download Complete Backup
            </button>

            <p id="backupStatus"
               style="color:#8290a5;font-size:13px;margin-top:12px;">
                Recommended: Take a backup once every week.
            </p>
        </div>

        <div class="card">
            <h2>Export Reports</h2>

            <p style="color:#8290a5;font-size:13px;">
                Download the reports currently accessible to your account.
            </p>

            <button type="button" id="exportCsvBtn">
                Download CSV
            </button>
        </div>
    `;
    
    $("exportCsvBtn").addEventListener(
        "click",
        exportReportsCSV
    );
    
    $("completeBackupBtn").addEventListener(
        "click",
        createCompleteBackup
    );
}

function exportReportsExcel(fromDate = "", toDate = "") {
    
    if (typeof XLSX === "undefined") {
        showToast("Excel library not loaded");
        return;
    }
    
    let reports = [...reportsCache];
    
    // Date range filter
    if (fromDate && toDate && fromDate > toDate) {
        showToast("From date cannot be after To date");
        return;
    }
    
    if (fromDate) {
        reports = reports.filter(
            report => report.report_date >= fromDate
        );
    }
    
    if (toDate) {
        reports = reports.filter(
            report => report.report_date <= toDate
        );
    }
    
    if (!reports.length) {
        showToast("No reports found for selected dates");
        return;
    }
    
    // Date-wise sorting
    reports.sort((a, b) =>
        String(a.report_date).localeCompare(String(b.report_date))
    );
    
    const rows = reports.map(report => {
        
        const staff = profilesCache.find(
            profile => profile.id === report.staff_id
        );
        
        const campus = campusesCache.find(
            item => item.id === report.campus_id
        );
        
        return {
            "Report Number": report.report_number,
            "Report Date": report.report_date || "",
            "Staff Name": staff?.full_name || "Staff",
            "Department": staff?.department || "—",
            "Campus": campus?.campus_name || "—",
            "Work Title": report.work_title || "",
            "Work Description": report.work_description || "",
            "Start Time": report.start_time || "",
            "End Time": report.end_time || "",
            "Work Status": titleCase(
                report.work_status || "pending"
            ),
            "Review Status": titleCase(
                report.status || "pending"
            ),
            "Remarks": report.remarks || ""
        };
    });
    
    // Create Excel worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);
    
    worksheet["!cols"] = [
        { wch: 15 },
        { wch: 14 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 },
        { wch: 25 },
        { wch: 40 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 35 }
    ];
    
    const workbook = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Reports"
    );
    
    const fileName = fromDate && toDate ?
        `Zonal-Reports-${fromDate}-to-${toDate}.xlsx` :
        "Zonal-All-Reports.xlsx";
    
    XLSX.writeFile(workbook, fileName);
    
    showToast("Excel download started");
}


// Download all reports
function downloadAllReportsExcel() {
    exportReportsExcel();
}


// Download selected date range
function downloadDateWiseExcel() {
    
    const fromDate = document.getElementById("exportFromDate")?.value;
    const toDate = document.getElementById("exportToDate")?.value;
    
    if (!fromDate || !toDate) {
        showToast("Please select both dates");
        return;
    }
    
    exportReportsExcel(fromDate, toDate);
}

// 18. EVENT LISTENERS

$("loginForm").addEventListener("submit", login);

$("forgotPasswordBtn").addEventListener(
    "click",
    forgotPassword
);

$("logoutBtn").addEventListener("click", logout);

$("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
});

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", async () => {

        const page = button.dataset.page;

        await goTo(page);

        $("sidebar").classList.remove("open");

    });
});

// 19. RESTORE EXISTING SESSION

async function initializeApp() {
    $("loginScreen").style.display = "flex";
    $("app").style.display = "none";

    const { data, error } = await dbClient.auth.getSession();

    if (error) {
        console.error(error);
        showToast("Unable to check login session");
        return;
    }

    if (data.session?.user) {
        await loadUserProfile(data.session.user);
    }
}

initializeApp();
async function testSupabaseConnection() {
    try {
        const { data, error } = await dbClient
            .from("zones")
            .select("id")
            .limit(1);

        if (error) {
            console.log("SUPABASE ERROR:", error);
        } else {
            console.log("SUPABASE CONNECTED:", data);
        }
    } catch (err) {
        console.log("CONNECTION FAILED:", err);
    }
}

function renderStaffAttendance() {
    if (!isStaff()) {
        showToast("Staff access only");
        return;
    }

    const now = new Date();

    const timeText = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata"
    });

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Staff Attendance</h1>
            <p>Record your campus arrival</p>
        </div>

        <div class="card attendance-card">
            <h2>Morning Attendance</h2>

            <div class="attendance-time-box">
                <span>IN TIME</span>
                <h1>${timeText}</h1>
                <p>India Standard Time</p>
            </div>

            <form id="attendanceForm">

                <label for="attendancePhoto">
                    Upload GPS-tagged Photo
                </label>

                <input
                    type="file"
                    id="attendancePhoto"
                    accept="image/jpeg,image/png,image/webp"
                    required
                >

                <div id="attendancePhotoPreview"></div>

                <div id="attendanceGPSInfo">
                    Select your GPS-tagged photo.
                </div>

<button type="button" id="attendanceSubmitBtn"
    >
    Submit Attendance
</button>

            </form>
        </div>
    `;

$("attendanceSubmitBtn").addEventListener("click", function(event) {
    alert("SUBMIT FUNCTION CALLING");
    
    submitStaffAttendance(event).catch(error => {
        console.error("Submit function error:", error);
        alert("ERROR: " + error.message);
    });
});
}






async function submitStaffAttendance(event) {
    event.preventDefault();

    const button = $("attendanceSubmitBtn");
    const file = $("attendancePhoto")?.files?.[0];

    if (!isStaff() || !currentUser?.id || !currentProfile?.campus_id) {
        showToast("Staff profile or campus information unavailable");
        return;
    }

    if (!file) {
        showToast("Please select your attendance photo.");
        return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        showToast("Please select JPG, PNG or WEBP photo.");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast("Photo must be below 5 MB.");
        return;
    }

    button.disabled = true;
    button.textContent = "Uploading Photo...";

    let photoPath = null;
    let uploadCompleted = false;

    try {
        const dateParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());

        const dateMap = Object.fromEntries(
            dateParts.map(part => [part.type, part.value])
        );

        const today =
            `${dateMap.year}-${dateMap.month}-${dateMap.day}`;
const { data: existingAttendance, error: checkError } =
    await dbClient
        .from("staff_attendance")
        .select("id")
        .eq("staff_id", currentUser.id)
        .eq("attendance_date", today)
        .maybeSingle();

if (checkError) throw checkError;

if (existingAttendance) {
    throw new Error("Today's attendance already submitted!");
}
        const extension = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        }[file.type];

        const fileName = `${crypto.randomUUID()}.${extension}`;

        photoPath = `${currentUser.id}/${today}/${fileName}`;

        const { error: uploadError } = await dbClient.storage
            .from("staff-attendance")
            .upload(photoPath, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) throw uploadError;

        uploadCompleted = true;

        button.textContent = "Saving Attendance...";

        const { data, error: insertError } = await dbClient
            .from("staff_attendance")
            .insert({
                staff_id: currentUser.id,
                campus_id: currentProfile.campus_id,
                photo_path: photoPath
            })
            .select()
            .single();

        if (insertError) throw insertError;

        console.log("ATTENDANCE SAVED:", data);

        showToast("Attendance submitted successfully!");

        await loadApplicationData();
        renderStaffAttendance();

    } catch (error) {
        console.error("ATTENDANCE ERROR:", error);

        if (uploadCompleted && photoPath) {
            await dbClient.storage
                .from("staff-attendance")
                .remove([photoPath]);
        }

        showToast(error.message || "Attendance submission failed");

        button.disabled = false;
        button.textContent = "Submit Attendance";
    }
}


async function renderAttendanceSection() {
    const container = $("attendanceRecordsContainer");

    if (!container) return;

    if (!attendanceCache.length) {
        container.innerHTML = `
            <p class="empty-state">
                No attendance records found.
            </p>
        `;
        return;
    }

    container.innerHTML = "<p>Loading attendance photos...</p>";

    const rows = await Promise.all(
        attendanceCache.map(async (record) => {

            let photoLink = "Photo unavailable";

            if (record.photo_path) {
                try {
                    const { data, error } = await dbClient.storage
                        .from("staff-attendance")
                        .createSignedUrl(record.photo_path, 3600);

                    if (!error && data?.signedUrl) {
                        photoLink = `<a href="${data.signedUrl}"
                            target="_blank" rel="noopener">View Photo</a>`;
                    } else {
                        console.warn("Attendance photo missing:", record.id);
                    }
                } catch (err) {
                    console.error(
                        "Attendance photo unavailable:",
                        record.id,
                        err
                    );
                }
            } else {
                console.warn(
                    "Attendance photo path missing:",
                    record.id
                );
            }

            const time = new Date(record.in_time)
                .toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                });

            const date = record.attendance_date || "-";
            const staff = record.staff?.full_name || "Unknown";
            const department = record.staff?.department || "-";
            const campus = record.campus?.campus_name || "-";

            return `
                <tr>
                    <td>${date}</td>
                    <td>${staff}</td>
                    <td>${department}</td>
                    <td>${campus}</td>
                    <td>${time}</td>
                    <td>${photoLink}</td>
                </tr>
            `;
        })
    );

    container.innerHTML = `
        <div class="export-actions">
            <button class="btn btn-primary"
                onclick="exportAttendanceExcel()">
                Download Excel
            </button>

            <button class="btn btn-secondary"
                onclick="exportAttendancePDF()">
                Download PDF
            </button>
        </div>

        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Staff</th>
                        <th>Department</th>
                        <th>Campus</th>
                        <th>In Time</th>
                        <th>Photo</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderDepositSlip() {
    $("pageContent").innerHTML = `
        <div class="card">
            <h2>Submit Deposit Slip</h2>
            <p>Upload deposit slip photo and enter available amounts.</p>

            <form id="depositSlipForm">

                <div class="form-group">
                    <label>Deposit Slip Photo (Optional)</label>
                    <input
                        type="file"
                        id="depositPhoto"
                        accept="image/jpeg,image/png,image/webp"
                    >
                </div>

                <div class="form-group">
                    <label>Sri Vasista Educational Trust Amount</label>
                    <input
                        type="number"
                        id="vasistaAmount"
                        min="0"
                        step="0.01"
                        placeholder="Enter amount"
                    >
                </div>

                <div class="form-group">
                    <label>Varsity South Amount</label>
                    <input
                        type="number"
                        id="varsityAmount"
                        min="0"
                        step="0.01"
                        placeholder="Enter amount"
                    >
                </div>

                <div class="form-group">
                    <label>Rank Guru Amount</label>
                    <input
                        type="number"
                        id="rankGuruAmount"
                        min="0"
                        step="0.01"
                        placeholder="Enter amount"
                    >
                </div>

                <button type="submit" class="btn btn-primary">
                    Submit Deposit
                </button>

            </form>
        </div>
    `;

    $("depositSlipForm").addEventListener(
        "submit",
        submitDepositSlip
    );
}

function renderAudits() {
    const campuses = campusesCache || [];

    $("pageContent").innerHTML = `
        <div class="page-heading">

            <button class="secondary-btn"
                    onclick="renderReports()">
                ← Back to All Reports
            </button>

            <h1>Campus Audit Management</h1>
            <p>Upload and manage campus-wise audit Excel files</p>
        </div>

        <div class="card">
            <h2>Upload New Audit</h2>

            <form id="auditUploadForm">

                <div class="form-group">
                    <label>Select Campus</label>
                    <select id="auditCampus" required>
                        <option value="">Select Campus</option>
                        ${campuses.map(c => `
                            <option value="${c.id}">
                                ${escapeHTML(c.campus_name)}
                            </option>
                        `).join("")}
                    </select>
                </div>

                <div class="form-group">
                    <label>Audit Date</label>
                    <input type="date"
                           id="auditDate"
                           required>
                </div>

                <div class="form-group">
                    <label>Audit Excel File</label>
                    <input type="file"
                           id="auditFile"
                           accept=".xlsx,.xls"
                           required>
                </div>

                <div class="form-group">
                    <label>Remarks (Optional)</label>
                    <textarea id="auditRemarks"
                              placeholder="Enter audit remarks"></textarea>
                </div>

                <button type="submit" class="btn btn-primary">
                    Upload Audit
                </button>

            </form>
        </div>

        <div class="card">
            <h2>Campus Audit History</h2>

            <div class="form-group">
                <label>Filter by Campus</label>

                <select id="auditHistoryCampus"
                        onchange="filterCampusAudits()">
                    <option value="">All Campuses</option>

                    ${campuses.map(c => `
                        <option value="${c.id}">
                            ${escapeHTML(c.campus_name)}
                        </option>
                    `).join("")}
                </select>
            </div>

            <button class="btn btn-primary"
                    onclick="downloadCampusAuditsZip()">
                📦 Download All Audits as ZIP
            </button>

            <div id="auditHistoryContainer">
                <p>Loading audit history...</p>
            </div>
        </div>
    `;

    $("auditUploadForm").addEventListener(
        "submit",
        submitCampusAudit
    );

    loadCampusAudits();
}

function renderAddStaff() {
    const campuses = campusesCache || [];

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Add New Staff</h1>
            <p>Create a staff account and assign campus details</p>
        </div>

        <div class="card">
            <form id="addStaffForm">

                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="staffFullName"
                        placeholder="Enter full name" required>
                </div>

                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="staffEmail"
                        placeholder="Enter email address" required>
                </div>

                <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="tel" id="staffMobile"
                        placeholder="Enter mobile number"
                        maxlength="10" required>
                </div>

                <div class="form-group">
                    <label>Employee ID</label>
                    <input type="text" id="staffEmployeeId"
                        placeholder="Enter employee ID" required>
                </div>

                <div class="form-group">
                    <label>Department</label>
                    <input type="text" id="staffDepartment"
                        placeholder="Enter department" required>
                </div>

                <div class="form-group">
                    <label>Assign Campus</label>
                    <select id="staffCampus" required>
                        <option value="">Select Campus</option>
                        ${campuses.map(c => `
                            <option value="${c.id}">
                                ${escapeHTML(c.campus_name)}
                            </option>
                        `).join("")}
                    </select>
                </div>

                <div class="form-group">
                    <label>Temporary Password</label>
                    <input type="password" id="staffPassword"
                        placeholder="Minimum 8 characters"
                        minlength="8" required>
                </div>

                <button type="submit" class="btn btn-primary">
                    Create Staff Account
                </button>

            </form>
        </div>
    `;

    $("addStaffForm").addEventListener(
        "submit",
        submitNewStaff
    );
}

async function renderStaffManagement() {
    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Staff Management</h1>
            <p>Staff directory and account overview</p>
        </div>

        <div class="stats-grid" id="staffStats">
            <div class="stat-card"><h3>Loading Staff...</h3></div>
        </div>

        <div class="card">
            <h2>Staff Directory</h2>

            <div class="form-group">
                <input type="search" id="staffSearch"
                    placeholder="Search name, email or Employee ID...">
            </div>

            <div id="staffDirectory">
                <p>Loading staff records...</p>
            </div>
        </div>
    `;
    
    await loadProfiles();
    
    const staffList = profilesCache.filter(
        profile => profile.role === "staff"
    );
    
    const activeCount = staffList.filter(
        profile => profile.is_active === true
    ).length;
    
    const inactiveCount = staffList.length - activeCount;
    
    $("staffStats").innerHTML = `
        <div class="stat-card">
            <h3>Total Staff</h3>
            <h1>${staffList.length}</h1>
        </div>
        <div class="stat-card">
            <h3>Active Staff</h3>
            <h1>${activeCount}</h1>
        </div>
        <div class="stat-card">
            <h3>Inactive Staff</h3>
            <h1>${inactiveCount}</h1>
        </div>
    `;
    
    function displayStaff(searchText = "") {
        const search = searchText.toLowerCase();
        
        const filtered = staffList.filter(profile => {
            const campus = campusesCache.find(
                c => c.id === profile.campus_id
            );
            
            const campusName = campus?.campus_name || "";
            
            return [
                profile.full_name,
                profile.email,
                profile.employee_id,
                profile.department,
                campusName
            ].some(value =>
                String(value || "").toLowerCase().includes(search)
            );
        });
        
        if (!filtered.length) {
            $("staffDirectory").innerHTML =
                "<p>No staff records found.</p>";
            return;
        }
        
        $("staffDirectory").innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Employee ID</th>
                            <th>Department</th>
                            <th>Campus</th>
                            <th>Mobile</th>
                            <th>Status</th>
                            ${isSuperAdmin() ? "<th>Action</th>" : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(profile => {
                            const campus = campusesCache.find(
                                c => c.id === profile.campus_id
                            );

                            return `
                                <tr>
                                    <td>${escapeHTML(profile.full_name)}</td>
                                    <td>${escapeHTML(profile.employee_id || "—")}</td>
                                    <td>${escapeHTML(profile.department || "—")}</td>
                                    <td>${escapeHTML(campus?.campus_name || "—")}</td>
                                    <td>${escapeHTML(profile.mobile || "—")}</td>
                                    <td>
                                        <span class="status-badge">
                                            ${profile.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>

                                    ${isSuperAdmin() ? `
                                        <td>
                                            <button class="btn ${profile.is_active ? "btn-danger" : "btn-primary"}"
                                                onclick="toggleStaffStatus('${profile.id}', ${profile.is_active})">
                                                ${profile.is_active ? "Deactivate" : "Activate"}
                                            </button>
                                        </td>
                                    ` : ""}
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    displayStaff();
    
    $("staffSearch").addEventListener("input", event => {
        displayStaff(event.target.value);
    });
}

async function submitNewStaff(event) {
    event.preventDefault();

    const staff = {
        full_name: $("staffFullName").value.trim(),
        email: $("staffEmail").value.trim(),
        mobile: $("staffMobile").value.trim(),
        employee_id: $("staffEmployeeId").value.trim(),
        department: $("staffDepartment").value.trim(),
        campus_id: $("staffCampus").value,
        password: $("staffPassword").value
    };

    if (!/^[6-9]\d{9}$/.test(staff.mobile)) {
        showToast("Enter a valid 10-digit mobile number", "error");
        return;
    }

    if (staff.password.length < 8) {
        showToast("Password must contain at least 8 characters", "error");
        return;
    }

    const button = event.submitter;
    button.disabled = true;
    button.textContent = "Creating Account...";

    try {
        const { data: sessionData } =
            await dbClient.auth.getSession();

        if (!sessionData.session) {
            throw new Error("Please login again. Session not found.");
        }

        console.log("Staff function request started");

        const { data, error } =
            await dbClient.functions.invoke("create-staff", {
                body: staff
            });

        if (error) {
            console.error("Function error:", error);
            console.error("Error context:", error.context);

            let details = error.message;

            if (error.context) {
                try {
                    const response = await error.context.json();
                    console.error("Server response:", response);
                    details = response.error || details;
                } catch (e) {
                    console.error("Could not read server response");
                }
            }

            throw new Error(details);
        }

        console.log("Function response:", data);

        if (!data?.success) {
            throw new Error(data?.error || "Staff creation failed");
        }

        showToast("Staff account created successfully!", "success");
        $("addStaffForm").reset();

    } catch (error) {
        console.error("Staff creation error:", error);
        showToast(error.message || "Unable to create staff account", "error");

    } finally {
        button.disabled = false;
        button.textContent = "Create Staff Account";
    }
}

async function submitCampusAudit(event) {
    event.preventDefault();

    const form = $("auditUploadForm");
    const button = form.querySelector('button[type="submit"]');

    const campusId = $("auditCampus").value;
    const auditDate = $("auditDate").value;
    const file = $("auditFile").files[0];
    const remarks = $("auditRemarks").value.trim();

    let uploadedPath = null;

    try {
        const role = currentProfile?.role;

        if (!["superadmin", "zonal", "assistant_zonal"].includes(role)) {
            showToast("You don't have permission");
            return;
        }

        if (!currentUser || !campusId || !auditDate || !file) {
            showToast("Please fill all required fields");
            return;
        }

        const extension = file.name.split(".").pop().toLowerCase();

        if (!["xlsx", "xls"].includes(extension)) {
            showToast("Only XLSX and XLS files are allowed");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast("File size must be below 10 MB");
            return;
        }

        button.disabled = true;
        button.textContent = "Uploading...";

        const safeFileName =
            `${crypto.randomUUID()}.${extension}`;

        const filePath =
            `${campusId}/${auditDate}/${safeFileName}`;

        // Upload Excel to private Storage
        const { data: uploadData, error: uploadError } =
            await dbClient.storage
                .from("campus-audits")
                .upload(filePath, file);

        if (uploadError) throw uploadError;

        uploadedPath = uploadData.path;

        // Save audit details in database
        const { error: insertError } = await dbClient
            .from("campus_audits")
            .insert({
                campus_id: campusId,
                audit_date: auditDate,
                file_name: file.name,
                file_path: uploadedPath,
                remarks: remarks || null,
                uploaded_by: currentUser.id
            });

        if (insertError) throw insertError;

        showToast("Audit Excel uploaded successfully!");

        form.reset();

        await loadCampusAudits();

    } catch (error) {
        console.error("Campus Audit Upload:", error);

        if (uploadedPath) {
            await dbClient.storage
                .from("campus-audits")
                .remove([uploadedPath]);
        }

        showToast(error.message || "Audit upload failed");

    } finally {
        button.disabled = false;
        button.textContent = "Upload Audit";
    }
}
let campusAuditsCache = [];

async function loadCampusAudits() {
    const container = $("auditHistoryContainer");

    const { data, error } = await dbClient
        .from("campus_audits")
        .select(`
            *,
            campus:campuses!campus_audits_campus_id_fkey(
                campus_name
            ),
            uploader:profiles!campus_audits_uploaded_by_fkey(
                full_name
            )
        `)
        .order("audit_date", { ascending: false });

    if (error) {
        console.error("Audit history error:", error);
        campusAuditsCache = [];

        if (container) {
            container.innerHTML =
                `<p>Unable to load audit history.</p>`;
        }
        return;
    }

    campusAuditsCache = data || [];

    renderCampusAuditHistory();
}
async function submitDepositSlip(event) {
    event.preventDefault();

    const button = document.querySelector(
        '#depositSlipForm button[type="submit"]'
    );

    const photo = $("depositPhoto").files[0];

    const vasista = $("vasistaAmount").value.trim();
    const varsity = $("varsityAmount").value.trim();
    const rankGuru = $("rankGuruAmount").value.trim();

    let uploadedPath = null;

    try {
        if (!currentUser || !currentProfile?.campus_id) {
            showToast("Staff profile or campus details missing");
            return;
        }

        const amounts = [vasista, varsity, rankGuru];

        if (amounts.some(v => v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0))) {
            showToast("Please enter valid amounts");
            return;
        }

        if (photo) {
            const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp"
            ];

            if (!allowedTypes.includes(photo.type)) {
                showToast("Please select JPG, PNG or WEBP image");
                return;
            }

            if (photo.size > 5 * 1024 * 1024) {
                showToast("Photo must be below 5 MB");
                return;
            }
        }

        button.disabled = true;
        button.textContent = "Submitting...";

        // Optional photo upload
        if (photo) {
            const today = new Date().toLocaleDateString(
                "en-CA",
                { timeZone: "Asia/Kolkata" }
            );

            const filePath =
                `${currentUser.id}/${today}/${crypto.randomUUID()}.${photo.name.split(".").pop()}`;

            const { data: uploadData, error: uploadError } =
                await dbClient.storage
                    .from("deposit-slips")
                    .upload(filePath, photo);

            if (uploadError) throw uploadError;

            uploadedPath = uploadData.path;
        }

        // Save deposit details
        const { error } = await dbClient
            .from("deposit_slips")
            .insert({
                staff_id: currentUser.id,
                campus_id: currentProfile.campus_id,
                photo_path: uploadedPath,
                sri_vasista_amount: vasista === "" ? null : Number(vasista),
                varsity_south_amount: varsity === "" ? null : Number(varsity),
                rank_guru_amount: rankGuru === "" ? null : Number(rankGuru)
            });

        if (error) throw error;

        showToast("Deposit slip submitted successfully!");

        $("depositSlipForm").reset();

    } catch (error) {
        console.error("Deposit submission error:", error);

        // Remove uploaded photo if database save failed
        if (uploadedPath) {
            await dbClient.storage
                .from("deposit-slips")
                .remove([uploadedPath]);
        }

        showToast(error.message || "Deposit submission failed");

    } finally {
        button.disabled = false;
        button.textContent = "Submit Deposit";
    }
}
async function loadDepositSlips() {
    const role = currentProfile?.role;

    if (!["superadmin", "zonal", "assistant_zonal"].includes(role)) {
        depositCache = [];
        return;
    }

    const { data, error } = await dbClient
        .from("deposit_slips")
        .select(`
            *,
            staff:profiles!deposit_slips_staff_id_fkey(
                full_name,
                department
            ),
            campus:campuses!deposit_slips_campus_id_fkey(
                campus_name
            )
        `)
        .order("submitted_at", { ascending: false });

    if (error) {
        console.error("Deposit loading error:", error);
        depositCache = [];
        return;
    }

    depositCache = data || [];
}

/* =====================================
   SUPABASE REALTIME - LIVE DATA UPDATES
===================================== */

let liveDataChannel = null;

function startLiveDataUpdates() {

    // Prevent duplicate subscriptions
    if (liveDataChannel) {
        dbClient.removeChannel(liveDataChannel);
        liveDataChannel = null;
    }

    liveDataChannel = dbClient
        .channel("zonal-live-data")

        // REPORTS
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "reports"
            },
            async (payload) => {
                console.log("Live report update:", payload.eventType);

                await loadReports();

                if (currentPage === "overview") {
                    renderOverview();
                }

                if (currentPage === "reports") {
                    renderReports();
                }

                if (currentPage === "myreports") {
                    renderMyReports();
                }
            }
        )

        // STAFF ATTENDANCE
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "staff_attendance"
            },
            async (payload) => {
                console.log("Live attendance update:", payload.eventType);

                await loadAttendance();

                if (currentPage === "reports") {
                    renderReports();
                }
            }
        )

        // DEPOSIT SLIPS
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "deposit_slips"
            },
            async (payload) => {
                console.log("Live deposit update:", payload.eventType);

                await loadDepositSlips();

                if (currentPage === "reports") {
                    renderReports();
                }
            }
        )

      .subscribe((status, err) => {
    console.log("Realtime connection:", status);

    if (err) {
        console.error("Realtime detailed error:", err);
    }
});
}

async function renderDepositSection() {
    const container = $("depositRecordsContainer");
    if (!container) return;

    if (!depositCache.length) {
        container.innerHTML = `
            <p class="empty-state">No deposit slips submitted yet.</p>
        `;
        return;
    }

    container.innerHTML = `
    <div class="export-actions">
        <button class="btn btn-primary" onclick="exportDepositExcel()">
            Download Excel
        </button>

        <button class="btn btn-secondary" onclick="exportDepositPDF()">
            Download PDF
        </button>
    </div>

    <div class="table-wrapper">
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Staff</th>
                    <th>Department</th>
                    <th>Campus</th>
                    <th>Vasista Trust</th>
                    <th>Varsity South</th>
                    <th>Rank Guru</th>
                    <th>Submitted Time</th>
                    <th>Photo</th>
                </tr>
            </thead>
            <tbody>
                    ${depositCache.map(item => `
                        <tr>
                            <td>${escapeHTML(item.deposit_date || "-")}</td>
                            <td>${escapeHTML(item.staff?.full_name || "-")}</td>
                            <td>${escapeHTML(item.staff?.department || "-")}</td>
                            <td>${escapeHTML(item.campus?.campus_name || "-")}</td>
                            <td>₹${Number(item.sri_vasista_amount || 0).toLocaleString("en-IN")}</td>
                            <td>₹${Number(item.varsity_south_amount || 0).toLocaleString("en-IN")}</td>
                            <td>₹${Number(item.rank_guru_amount || 0).toLocaleString("en-IN")}</td>
                            <td>${item.submitted_at ? new Date(item.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</td>
                            <td>
                                <span id="deposit-photo-${item.id}">
                                    ${item.photo_path ? "Loading photo..." : "No photo"}
                                </span>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    for (const item of depositCache) {
        if (!item.photo_path) continue;

        const { data, error } = await dbClient.storage
    .from("deposit-slips")
    .createSignedUrl(item.photo_path, 3600);

if (error) {
    console.error("Deposit signed URL error:", {
        id: item.id,
        path: item.photo_path,
        error: error
    });
}

        const photoElement = $(`deposit-photo-${item.id}`);

        if (photoElement) {
            photoElement.innerHTML = error
                ? "Photo unavailable"
                : `<a href="${data.signedUrl}" target="_blank" rel="noopener">View Photo</a>`;
        }
    }
}
function renderCampusAuditHistory(records = campusAuditsCache) {
    const container = $("auditHistoryContainer");
    if (!container) return;

    if (!records.length) {
        container.innerHTML = `
            <p>No audit files uploaded yet.</p>
        `;
        return;
    }

    container.innerHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Audit Date</th>
                        <th>Campus</th>
                        <th>File Name</th>
                        <th>Uploaded By</th>
                        <th>Remarks</th>
                        <th>Download</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(audit => `
                        <tr>
                            <td>${escapeHTML(audit.audit_date)}</td>
                            <td>${escapeHTML(audit.campus?.campus_name || "-")}</td>
                            <td>${escapeHTML(audit.file_name)}</td>
                            <td>${escapeHTML(audit.uploader?.full_name || "-")}</td>
                            <td>${escapeHTML(audit.remarks || "-")}</td>
                            <td>
                                <button
                                    type="button"
                                    onclick="downloadCampusAudit('${audit.id}')">
                                    Download
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}
function filterCampusAudits() {
    const campusId = $("auditHistoryCampus").value;

    const filtered = campusId
        ? campusAuditsCache.filter(
            audit => audit.campus_id === campusId
        )
        : campusAuditsCache;

    renderCampusAuditHistory(filtered);
}

async function downloadCampusAudit(auditId) {
    const audit = campusAuditsCache.find(
        item => item.id === auditId
    );

    if (!audit) {
        showToast("Audit record not found", "error");
        return;
    }

    try {
        const { data, error } = await dbClient.storage
            .from("campus-audits")
            .createSignedUrl(audit.file_path, 300);

        if (error) throw error;

        const response = await fetch(data.signedUrl);

        if (!response.ok) {
            throw new Error("Unable to fetch Excel file");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = audit.file_name || "Campus_Audit.xlsx";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 2000);

        showToast("Excel file downloaded", "success");

    } catch (error) {
        console.error("Individual audit download error:", error);
        showToast("Download failed: " + error.message, "error");
    }
}


async function downloadCampusAuditsZip() {
    const campusId = $("auditHistoryCampus").value;

    // Selected campus OR all campuses
    const records = campusId
        ? campusAuditsCache.filter(a => a.campus_id === campusId)
        : campusAuditsCache;

    if (!records.length) {
        showToast("No audit files found", "error");
        return;
    }

    const zip = new JSZip();

    try {
        showToast("Preparing audit ZIP...", "success");

        for (const audit of records) {
            const { data, error } = await dbClient.storage
                .from("campus-audits")
                .createSignedUrl(audit.file_path, 300);

            if (error) throw error;

            const response = await fetch(data.signedUrl);

            if (!response.ok) {
                throw new Error("Download failed: " + audit.file_name);
            }

            const blob = await response.blob();

            const campusName = audit.campus?.campus_name || "Campus";
            const folderName = campusName.replace(/[\/\\:*?"<>|]/g, "_");

            zip.folder(folderName)
               .folder(audit.audit_date)
               .file(audit.file_name, blob);
        }

        const zipBlob = await zip.generateAsync({
            type: "blob"
        });

        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");

        link.href = url;
        link.download = campusId
            ? "Campus_Audit_History.zip"
            : "All_Campuses_Audit_History.zip";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast("Audit ZIP downloaded successfully!", "success");

    } catch (error) {
        console.error("Audit ZIP error:", error);
        showToast("ZIP download failed: " + error.message, "error");
    }
}

function exportDepositExcel() {
    if (!depositCache.length) {
        alert("No deposit records available.");
        return;
    }

    const data = depositCache.map(item => ({
        "Date": item.deposit_date || "-",
        "Staff": item.staff?.full_name || "-",
        "Department": item.staff?.department || "-",
        "Campus": item.campus?.campus_name || "-",
        "Vasista Trust": Number(item.sri_vasista_amount || 0),
        "Varsity South": Number(item.varsity_south_amount || 0),
        "Rank Guru": Number(item.rank_guru_amount || 0),
        "Submitted Time": item.submitted_at
            ? new Date(item.submitted_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            })
            : "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(workbook, worksheet, "Deposit Slips");

downloadExcelFile(workbook, "Deposit_Slips.xlsx");
}


function exportDepositPDF() {
    if (!depositCache.length) {
        alert("No deposit records available.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");

    doc.setFontSize(16);
    doc.text("Deposit Slips Report", 14, 15);

    const rows = depositCache.map(item => [
        item.deposit_date || "-",
        item.staff?.full_name || "-",
        item.staff?.department || "-",
        item.campus?.campus_name || "-",
        Number(item.sri_vasista_amount || 0).toLocaleString("en-IN"),
        Number(item.varsity_south_amount || 0).toLocaleString("en-IN"),
        Number(item.rank_guru_amount || 0).toLocaleString("en-IN"),
        item.submitted_at
            ? new Date(item.submitted_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            })
            : "-"
    ]);

    doc.autoTable({
        startY: 23,
        head: [[
            "Date", "Staff", "Department", "Campus",
            "Vasista Trust", "Varsity South", "Rank Guru",
            "Submitted Time"
        ]],
        body: rows,
        styles: {
            fontSize: 7,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [12, 42, 80]
        }
    });

    doc.save("Deposit_Slips.pdf");
}

function exportAttendanceExcel() {
    if (!attendanceCache.length) {
        alert("No attendance records available.");
        return;
    }

    const data = attendanceCache.map(record => ({
        "Date": record.attendance_date || "-",
        "Staff": record.staff?.full_name || "Unknown",
        "Department": record.staff?.department || "-",
        "Campus": record.campus?.campus_name || "-",
        "In Time": record.in_time
            ? new Date(record.in_time).toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            })
            : "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

downloadExcelFile(workbook, "Staff_Attendance.xlsx");
}


function exportAttendancePDF() {
    if (!attendanceCache.length) {
        alert("No attendance records available.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");

    doc.setFontSize(16);
    doc.text("Staff Attendance Report", 14, 15);

    const rows = attendanceCache.map(record => [
        record.attendance_date || "-",
        record.staff?.full_name || "Unknown",
        record.staff?.department || "-",
        record.campus?.campus_name || "-",
        record.in_time
            ? new Date(record.in_time).toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            })
            : "-"
    ]);

    doc.autoTable({
        startY: 23,
        head: [[
            "Date", "Staff", "Department", "Campus", "In Time"
        ]],
        body: rows,
        styles: {
            fontSize: 8,
            cellPadding: 3
        },
        headStyles: {
            fillColor: [12, 42, 80]
        }
    });

    doc.save("Staff_Attendance.pdf");
}
function downloadExcelFile(workbook, fileName) {
    try {
        if (typeof XLSX === "undefined") {
            throw new Error("Excel library not loaded.");
        }

        const excelData = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array"
        });

        const blob = new Blob(
            [excelData],
            {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 2000);

    } catch (error) {
        console.error("Excel Download Error:", error);
        alert("Download failed: " + error.message);
    }
}

async function exportReportsCSV() {
    try {
        const { data, error } = await dbClient
            .from("reports")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast("No reports available to export", "error");
            return;
        }

        const headers = Object.keys(data[0]);

        const csvRows = [
            headers.join(","),
            ...data.map(row =>
                headers.map(key => {
                    const value = row[key] ?? "";
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(",")
            )
        ];

        const blob = new Blob(
            ["\uFEFF" + csvRows.join("\n")],
            { type: "text/csv;charset=utf-8;" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "Staff_Reports.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        showToast("Reports exported successfully", "success");

    } catch (error) {
        console.error("Reports CSV export error:", error);
        showToast("Export failed: " + error.message, "error");
    }
}
// =====================================
// WEEKLY COMPLETE BACKUP SYSTEM
// =====================================

async function createCompleteBackup() {

    const button = document.getElementById("completeBackupBtn");
    const status = document.getElementById("backupStatus");

    if (!button || !status) return;

    if (typeof JSZip === "undefined") {
        showToast("JSZip library not loaded");
        return;
    }

    button.disabled = true;
    button.textContent = "Creating Backup...";

    const zip = new JSZip();

    const backupDate = new Date();
    const dateLabel = backupDate.toISOString()
        .replace(/[:.]/g, "-");

    const errors = [];
    const summary = {
        backup_date: backupDate.toISOString(),
        tables: {},
        storage: {},
        warnings: errors
    };

    status.textContent = "Preparing database backup...";

    // All project database tables
    const excelBackupData = {};
    const tables = [
        "zones",
        "campuses",
        "profiles",
        "zone_memberships",
        "reports",
        "audit_logs",
        "staff_attendance",
        "deposit_slips",
        "campus_audits"
    ];

    // Private storage buckets
    const buckets = [
        "staff-attendance",
        "deposit-slips",
        "campus-audits"
    ];

    try {

        // 1. DATABASE BACKUP
        const databaseFolder = zip.folder("Database");

        for (const table of tables) {

            status.textContent =
                "Backing up database: " + table;

            let allRows = [];
            let offset = 0;
            const batchSize = 1000;

            try {

                while (true) {

                    const { data, error } = await dbClient
                        .from(table)
                        .select("*")
                        .range(offset, offset + batchSize - 1);

                    if (error) throw error;

                    const rows = data || [];

                    allRows = allRows.concat(rows);

                    if (rows.length < batchSize) break;

                    offset += batchSize;
                }

                databaseFolder.file(
                    table + ".json",
                    JSON.stringify(allRows, null, 2)
                );
// Keep data for Excel backup
excelBackupData[table] = allRows;

                summary.tables[table] = {
                    records: allRows.length,
                    status: "success"
                };

            } catch (error) {

                summary.tables[table] = {
                    status: "failed",
                    error: error.message
                };

                errors.push(
                    "Table " + table + ": " + error.message
                );
            }
        }
// 1B. EXCEL DATABASE BACKUP

status.textContent = "Creating Excel backup...";

try {

    if (typeof XLSX === "undefined") {
        throw new Error("Excel library not loaded");
    }

    const workbook = XLSX.utils.book_new();

    for (const table of tables) {

        const rows = excelBackupData[table];

        if (!rows) continue;

        const worksheet = rows.length
            ? XLSX.utils.json_to_sheet(rows)
            : XLSX.utils.aoa_to_sheet([
                ["No records available"]
            ]);

        const sheetName = table.substring(0, 31);

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            sheetName
        );
    }

    const excelFile = XLSX.write(
        workbook,
        {
            bookType: "xlsx",
            type: "array"
        }
    );

    zip.folder("Excel-Reports").file(
        "Complete-Database-Backup.xlsx",
        excelFile
    );

    summary.excel_backup = "success";

} catch (error) {

    summary.excel_backup = "failed";
    errors.push("Excel backup: " + error.message);

}
        // 2. STORAGE BACKUP
        const storageFolder = zip.folder("Storage");

        async function backupStorageFolder(
            bucketName,
            folderPath = ""
        ) {

            let offset = 0;
            const limit = 1000;

            while (true) {

                const { data, error } = await dbClient
                    .storage
                    .from(bucketName)
                    .list(folderPath, {
                        limit: limit,
                        offset: offset
                    });

                if (error) throw error;

                const items = data || [];

                for (const item of items) {

                    const itemPath = folderPath
                        ? folderPath + "/" + item.name
                        : item.name;

                    // Folder
                    if (!item.id) {

                        await backupStorageFolder(
                            bucketName,
                            itemPath
                        );

                        continue;
                    }

                    // File
                    status.textContent =
                        "Downloading storage file: " + itemPath;

                    const { data: fileData, error: downloadError } =
                        await dbClient
                            .storage
                            .from(bucketName)
                            .download(itemPath);

                    if (downloadError) {
                        throw new Error(
                            itemPath + ": " + downloadError.message
                        );
                    }

                    const bucketFolder =
                        storageFolder.folder(bucketName);

                    bucketFolder.file(itemPath, fileData);

                    summary.storage[bucketName].files++;
                }

                if (items.length < limit) break;

                offset += limit;
            }
        }

        for (const bucket of buckets) {

            summary.storage[bucket] = {
                files: 0,
                status: "success"
            };

            try {

                status.textContent =
                    "Backing up storage: " + bucket;

                await backupStorageFolder(bucket);

            } catch (error) {

                summary.storage[bucket].status = "failed";
                summary.storage[bucket].error = error.message;

                errors.push(
                    "Storage " + bucket + ": " + error.message
                );
            }
        }

        // 3. BACKUP MANIFEST
        zip.file(
            "Backup-Information.json",
            JSON.stringify(summary, null, 2)
        );

        // 4. WARNINGS FILE
        zip.file(
            "Backup-Warnings.txt",
            errors.length
                ? errors.join("\n")
                : "No errors reported during this backup."
        );

        // 5. CREATE ZIP
        status.textContent = "Creating ZIP file...";

        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
                level: 6
            }
        });

        const downloadUrl = URL.createObjectURL(zipBlob);

        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = "Zonal-Complete-Backup-" +
            dateLabel + ".zip";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
        }, 2000);

        if (errors.length) {

            status.textContent =
                "Backup downloaded with " +
                errors.length +
                " warning(s). Check Backup-Warnings.txt.";

            showToast("Backup downloaded with warnings");

        } else {

            status.textContent =
                "Backup downloaded successfully.";

            showToast("Complete backup downloaded successfully");
        }

    } catch (error) {

        console.error("Complete backup error:", error);

        status.textContent =
            "Backup failed: " + error.message;

        showToast("Backup failed: " + error.message);

    } finally {

        button.disabled = false;
        button.textContent = "Download Complete Backup";
    }
}

async function renderCashClosing() {
    if (!isStaff()) {
        showToast("Staff submission is available only for staff.");
        return;
    }

    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata"
    }).format(new Date());

    const { data: existing, error } = await dbClient
        .from("cash_closing_reports")
        .select("*")
        .eq("staff_id", currentUser.id)
        .eq("report_date", today)
        .maybeSingle();

    if (error) {
        console.error(error);
        showToast("Unable to load closing report.");
        return;
    }

    const report = existing || {};

    $("pageContent").innerHTML = `
        <div class="card cash-closing-card">
            <div class="dashboard-section-heading">
                <div>
                    <h2>Daily Cash & Closing Report</h2>
                    <p>Submit your campus daily closing details</p>
                </div>
            </div>

            <form id="cashClosingForm">

                <div class="form-group">
                    <label>Report Date</label>
                    <input type="date" value="${today}" disabled>
                </div>

                <h3>Day Sheet Closing</h3>

                <div class="form-group">
                    <label>Day Sheet Closing Status</label>
                    <select id="daySheetStatus" required>
                        <option value="">Select Status</option>
                        <option value="yes" ${report.day_sheet_status === "yes" ? "selected" : ""}>Yes</option>
                        <option value="no" ${report.day_sheet_status === "no" ? "selected" : ""}>No</option>
                    </select>
                </div>

                <div class="form-group" id="daySheetReasonGroup" style="display:none">
                    <label>Reason</label>
                    <textarea id="daySheetReason">${escapeHTML(report.day_sheet_reason || "")}</textarea>
                </div>

                <h3>Pocket Money Closing</h3>

                <div class="form-group">
                    <label>Pocket Money Closing Status</label>
                    <select id="pocketStatus" required>
                        <option value="">Select Status</option>
                        <option value="yes" ${report.pocket_money_closing_status === "yes" ? "selected" : ""}>Yes</option>
                        <option value="no" ${report.pocket_money_closing_status === "no" ? "selected" : ""}>No</option>
                    </select>
                </div>

                <div class="form-group" id="pocketReasonGroup" style="display:none">
                    <label>Reason</label>
                    <textarea id="pocketReason">${escapeHTML(report.pocket_money_closing_reason || "")}</textarea>
                </div>

                <h3>Cash on Hand</h3>

                <div class="form-group">
                    <label>Cash Payment (₹)</label>
                    <input type="number" id="cashPayment" min="0" step="0.01"
                        value="${report.cash_payment ?? 0}" required>
                </div>

                <div class="form-group">
                    <label>Card Payment (₹)</label>
                    <input type="number" id="cardPayment" min="0" step="0.01"
                        value="${report.card_payment ?? 0}" required>
                </div>

                <div class="form-group">
                    <label>Pocket Money Balance (₹)</label>
                    <input type="number" id="pocketBalance" min="0" step="0.01"
                        value="${report.pocket_money_balance ?? 0}" required>
                </div>

                <div class="form-group">
                    <label>Expenditure Balance (₹)</label>
                    <input type="number" id="expenditureBalance" min="0" step="0.01"
                        value="${report.expenditure_balance ?? 0}" required>
                </div>

                <h3>Students Reporting Status</h3>

                <div class="form-group">
                    <label>JR's (Optional)</label>
                    <input type="number" id="jrStudents" min="0"
                        value="${report.jr_students ?? ""}">
                </div>

                <div class="form-group">
                    <label>SR's (Optional)</label>
                    <input type="number" id="srStudents" min="0"
                        value="${report.sr_students ?? ""}">
                </div>

                <button type="submit" id="cashClosingSubmitBtn">
                    ${existing ? "Update Report" : "Submit Report"}
                </button>

            </form>
        </div>
    `;

    const dayStatus = $("daySheetStatus");
    const pocketStatus = $("pocketStatus");

    function updateReasonFields() {
        $("daySheetReasonGroup").style.display =
            dayStatus.value === "no" ? "block" : "none";

        $("pocketReasonGroup").style.display =
            pocketStatus.value === "no" ? "block" : "none";
    }

    dayStatus.addEventListener("change", updateReasonFields);
    pocketStatus.addEventListener("change", updateReasonFields);
    updateReasonFields();

    $("cashClosingForm").addEventListener(
        "submit",
        submitCashClosingReport
    );
}

async function submitCashClosingReport(event) {
    event.preventDefault();

    const button = $("cashClosingSubmitBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    const dayStatus = $("daySheetStatus").value;
    const pocketStatus = $("pocketStatus").value;
    const dayReason = $("daySheetReason").value.trim();
    const pocketReason = $("pocketReason").value.trim();

    if (dayStatus === "no" && !dayReason) {
        showToast("Please enter the Day Sheet closing reason.");
        button.disabled = false;
        button.textContent = "Submit Report";
        return;
    }

    if (pocketStatus === "no" && !pocketReason) {
        showToast("Please enter the Pocket Money closing reason.");
        button.disabled = false;
        button.textContent = "Submit Report";
        return;
    }

    const numberValue = id =>
        Number($(id).value);

    const optionalNumber = id =>
        $(id).value.trim() === "" ? null : Number($(id).value);

    const values = {
        staff_id: currentUser.id,
        campus_id: currentProfile.campus_id,
        report_date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata"
        }).format(new Date()),

        day_sheet_status: dayStatus,
        day_sheet_reason: dayStatus === "no" ? dayReason : null,

        pocket_money_closing_status: pocketStatus,
        pocket_money_closing_reason: pocketStatus === "no" ? pocketReason : null,

        cash_payment: numberValue("cashPayment"),
        card_payment: numberValue("cardPayment"),
        pocket_money_balance: numberValue("pocketBalance"),
        expenditure_balance: numberValue("expenditureBalance"),

        jr_students: optionalNumber("jrStudents"),
        sr_students: optionalNumber("srStudents"),

        updated_at: new Date().toISOString()
    };

    try {
        if (
            Object.values(values).some(value =>
                typeof value === "number" &&
                (!Number.isFinite(value) || value < 0)
            )
        ) {
            throw new Error("Please enter valid non-negative amounts and counts.");
        }

        const { data: existing, error: checkError } = await dbClient
            .from("cash_closing_reports")
            .select("id")
            .eq("staff_id", currentUser.id)
            .eq("report_date", values.report_date)
            .maybeSingle();

        if (checkError) throw checkError;

        let result;

        if (existing) {
            result = await dbClient
                .from("cash_closing_reports")
                .update(values)
                .eq("id", existing.id);
        } else {
            result = await dbClient
                .from("cash_closing_reports")
                .insert(values);
        }

        if (result.error) throw result.error;

        showToast(existing
            ? "Cash & Closing Report updated successfully!"
            : "Cash & Closing Report submitted successfully!"
        );

        await renderCashClosing();

    } catch (error) {
        console.error("CASH CLOSING ERROR:", error);
        showToast(error.message || "Unable to save report.");
        button.disabled = false;
        button.textContent = "Submit Report";
    }
}


async function renderCashClosingReports() {
    const content = $("pageContent");

    content.innerHTML = `
        <div class="card">
            <h2>Cash & Closing Reports</h2>
            <p>Campus-wise daily closing reports</p>
            <div id="cashClosingReportList">
                Loading reports...
            </div>
        </div>
    `;

    const list = $("cashClosingReportList");

    try {
        // Fetch reports
        const { data, error } = await dbClient
            .from("cash_closing_reports")
            .select("*")
            .order("report_date", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML =
                "<p>No Cash & Closing Reports submitted yet.</p>";
            return;
        }

        // Fetch campus names directly
        const campusIds = [
            ...new Set(data.map(report => report.campus_id).filter(Boolean))
        ];

        const { data: campuses, error: campusError } = await dbClient
            .from("campuses")
            .select("id, campus_name")
            .in("id", campusIds);

        if (campusError) throw campusError;

        // Create campus lookup
        const campusMap = Object.fromEntries(
            (campuses || []).map(campus => [
                campus.id,
                campus.campus_name
            ])
        );

        // Render report cards
        list.innerHTML = data.map(report => {
            const staff = profilesCache.find(
                p => p.id === report.staff_id
            );

            const campusName =
                campusMap[report.campus_id] || "Campus not found";

            return `
                <div class="card" style="margin-top:15px">
                    <h3>${escapeHTML(staff?.full_name || "Staff")}</h3>

                    <p>Campus: ${escapeHTML(campusName)}</p>

                    <p>Date: ${escapeHTML(report.report_date || "")}</p>

                    <hr>

                    <p>Day Sheet:
                    ${report.day_sheet_status === "yes"
                        ? "Completed"
                        : "Not Completed"}</p>

                    ${report.day_sheet_reason ? `
                        <p>Reason:
                        ${escapeHTML(report.day_sheet_reason)}</p>
                    ` : ""}

                    <p>Pocket Money Closing:
                    ${report.pocket_money_closing_status === "yes"
                        ? "Completed"
                        : "Not Completed"}</p>

                    ${report.pocket_money_closing_reason ? `
                        <p>Reason:
                        ${escapeHTML(report.pocket_money_closing_reason)}</p>
                    ` : ""}

                    <p>Cash Payment: ₹${Number(report.cash_payment || 0).toLocaleString("en-IN")}</p>

                    <p>Card Payment: ₹${Number(report.card_payment || 0).toLocaleString("en-IN")}</p>

                    <p>Pocket Money Balance: ₹${Number(report.pocket_money_balance || 0).toLocaleString("en-IN")}</p>

                    <p>Expenditure Balance: ₹${Number(report.expenditure_balance || 0).toLocaleString("en-IN")}</p>

                    <p>JR Students: ${report.jr_students ?? "-"}</p>

                    <p>SR Students: ${report.sr_students ?? "-"}</p>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("CASH CLOSING REPORT ERROR:", error);

        list.innerHTML = `
            <p style="color:#dc2626">
                Unable to load reports: ${escapeHTML(error.message)}
            </p>
        `;
    }
}

async function getCashClosingExportData() {
    const { data, error } = await dbClient
        .from("cash_closing_reports")
        .select("*")
        .order("report_date", { ascending: false });

    if (error) {
        console.error("Cash Closing Fetch Error:", error);
        showToast(error.message || "Unable to load reports");
        return null;
    }

    return data || [];
}
// GET CASH CLOSING REPORTS
// ==========================================
// GET CASH CLOSING REPORTS
// ==========================================

async function getCashClosingExportData() {
    const { data, error } = await dbClient
        .from("cash_closing_reports")
        .select("*")
        .order("report_date", { ascending: false });
    
    if (error) {
        console.error("Cash Closing Fetch Error:", error);
        showToast(error.message || "Unable to load reports");
        return null;
    }
    
    return data || [];
}


// ==========================================
// DOWNLOAD CASH CLOSING EXCEL
// ==========================================

async function downloadCashClosingExcel() {
    
    if (typeof XLSX === "undefined") {
        showToast("Excel library not loaded");
        return;
    }
    
    const records = await getCashClosingExportData();
    
    if (!records || records.length === 0) {
        showToast("No Cash Closing Reports found");
        return;
    }
    
    const campusIds = [...new Set(records.map(r => r.campus_id))];
    const staffIds = [...new Set(records.map(r => r.staff_id))];
    
    // FETCH CAMPUS DETAILS
    const { data: campuses, error: campusError } = await dbClient
        .from("campuses")
        .select("id, campus_name")
        .in("id", campusIds);
    
    if (campusError) {
        console.error("CAMPUS FETCH ERROR:", campusError);
        showToast(campusError.message || "Campus fetch failed");
        return;
    }
    
    // FETCH STAFF DETAILS
    const { data: staffMembers, error: staffError } = await dbClient
        .from("profiles")
        .select("id, full_name")
        .in("id", staffIds);
    
    if (staffError) {
        console.error("STAFF FETCH ERROR:", staffError);
        showToast(staffError.message || "Staff fetch failed");
        return;
    }
    
    // CREATE NAME MAPS
    const campusMap = Object.fromEntries(
        (campuses || []).map(c => [c.id, c.campus_name])
    );
    
    const staffMap = Object.fromEntries(
        (staffMembers || []).map(s => [s.id, s.full_name])
    );
    
    // PREPARE EXCEL ROWS
    const rows = records.map(r => ({
        "Date": r.report_date,
        "Staff Name": staffMap[r.staff_id] || "N/A",
        "Campus": campusMap[r.campus_id] || "N/A",
        "Day Sheet Status": r.day_sheet_status,
        "Day Sheet Reason": r.day_sheet_reason || "",
        "Pocket Money Closing": r.pocket_money_closing_status,
        "Pocket Money Reason": r.pocket_money_closing_reason || "",
        "Cash Payment (₹)": Number(r.cash_payment || 0),
        "Card Payment (₹)": Number(r.card_payment || 0),
        "Pocket Money Balance (₹)": Number(r.pocket_money_balance || 0),
        "Expenditure Balance (₹)": Number(r.expenditure_balance || 0),
        "JR Students": r.jr_students ?? "",
        "SR Students": r.sr_students ?? ""
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Cash Closing Reports"
    );
    
    XLSX.writeFile(
        workbook,
        "Cash_Closing_Reports.xlsx"
    );
    
    showToast("Excel downloaded successfully");
}


// ==========================================
// DOWNLOAD CASH CLOSING PDF
// ==========================================

async function downloadCashClosingPDF() {
    
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast("PDF library not loaded");
        return;
    }
    
    const records = await getCashClosingExportData();
    
    if (!records || records.length === 0) {
        showToast("No Cash Closing Reports found");
        return;
    }
    
    const campusIds = [...new Set(records.map(r => r.campus_id))];
    const staffIds = [...new Set(records.map(r => r.staff_id))];
    
    // FETCH CAMPUS DETAILS
    const { data: campuses, error: campusError } = await dbClient
        .from("campuses")
        .select("id, campus_name")
        .in("id", campusIds);
    
    if (campusError) {
        console.error("CAMPUS FETCH ERROR:", campusError);
        showToast(campusError.message || "Campus fetch failed");
        return;
    }
    
    // FETCH STAFF DETAILS
    const { data: staffMembers, error: staffError } = await dbClient
        .from("profiles")
        .select("id, full_name")
        .in("id", staffIds);
    
    if (staffError) {
        console.error("STAFF FETCH ERROR:", staffError);
        showToast(staffError.message || "Staff fetch failed");
        return;
    }
    
    // CREATE NAME MAPS
    const campusMap = Object.fromEntries(
        (campuses || []).map(c => [c.id, c.campus_name])
    );
    
    const staffMap = Object.fromEntries(
        (staffMembers || []).map(s => [s.id, s.full_name])
    );
    
    const { jsPDF } = window.jspdf;
    
    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a3"
    });
    
    // PREPARE PDF ROWS
    const rows = records.map(r => [
        r.report_date || "",
        staffMap[r.staff_id] || "N/A",
        campusMap[r.campus_id] || "N/A",
        r.day_sheet_status || "",
        r.day_sheet_reason || "-",
        r.pocket_money_closing_status || "",
        r.pocket_money_closing_reason || "-",
        Number(r.cash_payment || 0).toFixed(2),
        Number(r.card_payment || 0).toFixed(2),
        Number(r.pocket_money_balance || 0).toFixed(2),
        Number(r.expenditure_balance || 0).toFixed(2),
        r.jr_students ?? "-",
        r.sr_students ?? "-"
    ]);
    
    doc.setFontSize(16);
    doc.text("Cash & Closing Reports", 14, 15);
    
    doc.autoTable({
        startY: 22,
        
        head: [
            [
                "Date",
                "Staff",
                "Campus",
                "Day Sheet",
                "Reason",
                "Pocket Closing",
                "Reason",
                "Cash (Rs.)",
                "Card (Rs.)",
                "Pocket Balance",
                "Expenditure",
                "JR",
                "SR"
            ]
        ],
        
        body: rows,
        
        styles: {
            fontSize: 7,
            cellPadding: 2,
            overflow: "linebreak"
        },
        
        headStyles: {
            fillColor: [25, 45, 85]
        },
        
        margin: {
            left: 10,
            right: 10
        }
    });
    
    doc.save("Cash_Closing_Reports.pdf");
    
    showToast("PDF downloaded successfully");
}

function renderDaysheetSubmission() {
    const today = new Date().toLocaleDateString("en-CA");

    $("pageContent").innerHTML = `
        <div class="page-heading">
            <h1>Daysheet Submission</h1>
            <p>Upload your daily daysheet image</p>
        </div>

        <div class="card">
            <form id="daysheetForm">

                <div class="form-group">
                    <label>Submission Date</label>
                    <input type="date"
                           id="daysheetDate"
                           value="${today}"
                           required>
                </div>

                <div class="form-group">
                    <label>Daysheet Image</label>
                    <input type="file"
                           id="daysheetImage"
                           accept="image/jpeg,image/png,image/webp"
                           required>
                    <small>Maximum file size: 5 MB</small>
                </div>

                <div id="daysheetPreview"></div>

                <button type="submit"
                        class="btn btn-primary"
                        id="daysheetSubmitBtn">
                    Submit Daysheet
                </button>

            </form>
        </div>
    `;

    const imageInput = $("daysheetImage");

    imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];
        const preview = $("daysheetPreview");

        if (!file) {
            preview.innerHTML = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be below 5 MB");
            imageInput.value = "";
            preview.innerHTML = "";
            return;
        }

        preview.innerHTML = `
            <img src="${URL.createObjectURL(file)}"
                 alt="Daysheet preview"
                 style="max-width:100%;max-height:300px;
                        object-fit:contain;border-radius:10px;
                        margin:12px 0;">
        `;
    });

    $("daysheetForm").addEventListener(
        "submit",
        submitDaysheet
    );
}

async function submitDaysheet(event) {
    event.preventDefault();

    const button = $("daysheetSubmitBtn");
    const file = $("daysheetImage").files[0];
    const reportDate = $("daysheetDate").value;

    if (!file || !reportDate) {
        showToast("Please select date and image");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast("Image must be below 5 MB");
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showToast("Only JPG, PNG and WEBP images are allowed");
        return;
    }

    const staffId = currentProfile.id;
    const campusId = currentProfile.campus_id;

    if (!staffId || !campusId) {
        showToast("Staff profile or campus information missing");
        return;
    }

    button.disabled = true;
    button.textContent = "Uploading...";

    try {
        const fileName =
            `${staffId}/${Date.now()}-${crypto.randomUUID()}.${file.type.split("/")[1]}`;

        const { error: uploadError } = await dbClient.storage
            .from("daysheet-images")
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { error: insertError } = await dbClient
            .from("daysheet_submissions")
            .insert({
                staff_id: staffId,
                campus_id: campusId,
                image_path: fileName,
                report_date: reportDate
            });

        if (insertError) {
            await dbClient.storage
                .from("daysheet-images")
                .remove([fileName]);

            throw insertError;
        }

        showToast("Daysheet submitted successfully!");
        renderDaysheetSubmission();

    } catch (error) {
        console.error("DAYSHEET SUBMISSION ERROR:", error);
        showToast("Submission failed: " + error.message);

    } finally {
        const submitButton = $("daysheetSubmitBtn");
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Submit Daysheet";
        }
    }
}

async function renderDaysheetReports() {
    const container = $("daysheetRecordsContainer");
    if (!container) return;

    try {
        const { data, error } = await dbClient
            .from("daysheet_submissions")
            .select("*")
            .order("submitted_at", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = "<p>No Daysheet submissions found.</p>";
            return;
        }

        const staffIds = [...new Set(data.map(r => r.staff_id))];
        const campusIds = [...new Set(data.map(r => r.campus_id))];

        const { data: staff, error: staffError } = await dbClient
            .from("profiles")
            .select("id, full_name, department")
            .in("id", staffIds);

        if (staffError) throw staffError;

        const { data: campuses, error: campusError } = await dbClient
            .from("campuses")
            .select("id, campus_name")
            .in("id", campusIds);

        if (campusError) throw campusError;

        const staffMap = Object.fromEntries(
            (staff || []).map(s => [s.id, s])
        );

        const campusMap = Object.fromEntries(
            (campuses || []).map(c => [c.id, c.campus_name])
        );

        const records = await Promise.all(data.map(async report => {
            const { data: signedData, error: signedError } =
                await dbClient.storage
                    .from("daysheet-images")
                    .createSignedUrl(report.image_path, 3600);

            if (signedError) {
                console.error("Image URL error:", signedError);
            }

            return {
                ...report,
                imageUrl: signedData?.signedUrl || null
            };
        }));

        container.innerHTML = `
            <p><strong>Total submissions: ${records.length}</strong></p>

            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Employee</th>
                            <th>Department</th>
                            <th>Campus</th>
                            <th>Daysheet Image</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(report => {
                            const employee = staffMap[report.staff_id] || {};

                            return `
                                <tr>
                                    <td>${escapeHTML(report.report_date || "")}</td>
                                    <td>${escapeHTML(
                                        report.submitted_at
                                            ? new Date(report.submitted_at).toLocaleTimeString("en-IN")
                                            : ""
                                    )}</td>
                                    <td>${escapeHTML(employee.full_name || "Unknown")}</td>
                                    <td>${escapeHTML(employee.department || "-")}</td>
                                    <td>${escapeHTML(campusMap[report.campus_id] || "Unknown")}</td>
                                    <td>
                                        ${report.imageUrl
                                            ? `
                                                <a href="${report.imageUrl}"
                                                   target="_blank"
                                                   rel="noopener">
                                                    <img src="${report.imageUrl}"
                                                         alt="Daysheet"
                                                         style="width:100px;height:100px;
                                                         object-fit:cover;border-radius:8px;">
                                                </a>
                                                <br>
                                                <a href="${report.imageUrl}"
                                                   download="daysheet-image">
                                                    View / Download
                                                </a>
                                              `
                                            : "Image unavailable"}
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {
        console.error("DAYSHEET REPORT ERROR:", error);

        container.innerHTML = `
            <p style="color:#dc2626">
                Unable to load Daysheet Reports:
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

async function getDaysheetExportData() {
    const { data, error } = await dbClient
        .from("daysheet_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });

    if (error) throw error;

    const records = data || [];

    if (!records.length) {
        throw new Error("No Daysheet records available");
    }

    const staffIds = [...new Set(records.map(r => r.staff_id))];
    const campusIds = [...new Set(records.map(r => r.campus_id))];

    const { data: staff, error: staffError } = await dbClient
        .from("profiles")
        .select("id, full_name, department")
        .in("id", staffIds);

    if (staffError) throw staffError;

    const { data: campuses, error: campusError } = await dbClient
        .from("campuses")
        .select("id, campus_name")
        .in("id", campusIds);

    if (campusError) throw campusError;

    const staffMap = Object.fromEntries(
        (staff || []).map(s => [s.id, s])
    );

    const campusMap = Object.fromEntries(
        (campuses || []).map(c => [c.id, c.campus_name])
    );

    return Promise.all(records.map(async r => {
        const { data: signed, error: signedError } = await dbClient.storage
            .from("daysheet-images")
            .createSignedUrl(r.image_path, 3600);

        if (signedError) {
            console.error("Signed URL error:", signedError);
        }

        return {
            ...r,
            employee: staffMap[r.staff_id] || {},
            campusName: campusMap[r.campus_id] || "Unknown",
            imageUrl: signed?.signedUrl || null
        };
    }));
}


// Convert image URL to Base64
async function daysheetImageToBase64(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Unable to download a daysheet image");
    }

    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(blob);
    });
}


// DOWNLOAD EXCEL WITH IMAGES
async function downloadDaysheetExcel() {
    try {
        showToast("Preparing Excel...");

        const records = await getDaysheetExportData();

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Daysheet Reports");

        sheet.columns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Time", key: "time", width: 15 },
            { header: "Employee", key: "employee", width: 25 },
            { header: "Department", key: "department", width: 20 },
            { header: "Campus", key: "campus", width: 25 },
            { header: "Daysheet Image", key: "image", width: 22 }
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).height = 25;

        for (const record of records) {
            const row = sheet.addRow({
                date: record.report_date || "",
                time: record.submitted_at
                    ? new Date(record.submitted_at).toLocaleTimeString("en-IN")
                    : "",
                employee: record.employee.full_name || "Unknown",
                department: record.employee.department || "-",
                campus: record.campusName,
                image: ""
            });

            row.height = 85;

            if (record.imageUrl) {
                try {
                    const base64 = await daysheetImageToBase64(
                        record.imageUrl
                    );

                    const extension = base64.startsWith("data:image/png")
                        ? "png"
                        : base64.startsWith("data:image/webp")
                        ? "webp"
                        : "jpeg";

                    const imageId = workbook.addImage({
                        base64: base64.split(",")[1],
                        extension
                    });

                    sheet.addImage(imageId, {
                        tl: { col: 5, row: row.number - 1 },
                        br: { col: 6, row: row.number }
                    });

                } catch (imageError) {
                    console.error("Excel image error:", imageError);
                    row.getCell(6).value = "Image unavailable";
                }
            }
        }

        sheet.views = [{ state: "frozen", ySplit: 1 }];

        const buffer = await workbook.xlsx.writeBuffer();

        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Daysheet_Reports.xlsx";
        link.click();

        URL.revokeObjectURL(link.href);

        showToast("Excel downloaded successfully!");

    } catch (error) {
        console.error("DAYSHEET EXCEL ERROR:", error);
        showToast("Excel download failed: " + error.message);
    }
}


// DOWNLOAD PDF WITH IMAGES
async function downloadDaysheetPDF() {
    try {
        showToast("Preparing PDF with images...");

        const records = await getDaysheetExportData();
        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            if (i > 0) pdf.addPage();

            pdf.setFontSize(17);
            pdf.text("Daysheet Report", 15, 18);

            pdf.setFontSize(10);

            const details = [
                `Date: ${record.report_date || "-"}`,
                `Time: ${record.submitted_at
                    ? new Date(record.submitted_at).toLocaleTimeString("en-IN")
                    : "-"}`,
                `Employee: ${record.employee.full_name || "Unknown"}`,
                `Department: ${record.employee.department || "-"}`,
                `Campus: ${record.campusName}`
            ];

            let y = 32;

            details.forEach(line => {
                pdf.text(line, 15, y);
                y += 8;
            });

            if (record.imageUrl) {
                try {
                    const imageData = await daysheetImageToBase64(
                        record.imageUrl
                    );

                    const format = imageData.startsWith("data:image/png")
                        ? "PNG"
                        : "JPEG";

                    const imageProperties = pdf.getImageProperties(imageData);

                    const maxWidth = 180;
                    const maxHeight = 185;

                    const ratio = Math.min(
                        maxWidth / imageProperties.width,
                        maxHeight / imageProperties.height
                    );

                    const width = imageProperties.width * ratio;
                    const height = imageProperties.height * ratio;

                    pdf.addImage(
                        imageData,
                        format,
                        15,
                        y + 5,
                        width,
                        height
                    );

                } catch (imageError) {
                    console.error("PDF image error:", imageError);
                    pdf.text("Image unavailable", 15, y + 8);
                }
            } else {
                pdf.text("Image unavailable", 15, y + 8);
            }
        }

        pdf.save("Daysheet_Reports.pdf");

        showToast("PDF downloaded successfully!");

    } catch (error) {
        console.error("DAYSHEET PDF ERROR:", error);
        showToast("PDF download failed: " + error.message);
    }
}

// =====================================
// EMERGENCY NOTIFICATIONS
// =====================================

let emergencyChannel = null;

function canSendEmergencyNotification() {
    return ["superadmin", "zonal", "assistant_zonal"]
        .includes(currentProfile?.role);
}

// Send notification
async function sendEmergencyNotification() {
    const input = document.getElementById("emergencyMessage");
    const button = document.getElementById("sendEmergencyBtn");

    const message = input?.value.trim();

    if (!message) {
        showToast("Please enter an emergency message");
        return;
    }

    if (!canSendEmergencyNotification()) {
        showToast("You don't have permission");
        return;
    }

    button.disabled = true;
    button.textContent = "Sending...";

    try {
        const { error } = await dbClient
            .from("emergency_notifications")
            .insert({
                sender_id: currentProfile.id,
                message: message
            });

        if (error) throw error;

        input.value = "";
        showToast("Emergency notification sent!");
        await loadEmergencyNotifications();

    } catch (error) {
        console.error("EMERGENCY SEND ERROR:", error);
        showToast("Unable to send: " + error.message);

    } finally {
        button.disabled = false;
        button.textContent = "Send Notification";
    }
}


// Load notifications
async function loadEmergencyNotifications() {
    const list = document.getElementById("notificationList");
    const count = document.getElementById("notificationCount");
const sendBox = document.getElementById("emergencySendBox");

if (sendBox) {
    sendBox.style.display =
        canSendEmergencyNotification() ? "block" : "none";
}
    if (!currentProfile?.id) return;

    try {
        const { data: notifications, error } = await dbClient
            .from("emergency_notifications")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) throw error;

        const { data: reads, error: readError } = await dbClient
            .from("emergency_notification_reads")
            .select("notification_id")
            .eq("user_id", currentProfile.id);

        if (readError) throw readError;

        const readIds = new Set(
            (reads || []).map(item => item.notification_id)
        );

        const unread = (notifications || []).filter(
            item => !readIds.has(item.id)
        );

        
const totalCount = (notifications || []).length;
const unreadCount = unread.length;
const readCount = totalCount - unreadCount;

// Bell badge
if (count) {
    count.textContent = unreadCount > 99 ? "99+" : unreadCount;
    count.style.display = unreadCount > 0 ? "flex" : "none";
}

// Read / Unread summary
if (list) {
    list.innerHTML = `
        <div class="notification-summary">
            <span>Total: ${totalCount}</span>
            <span class="unread-label">Unread: ${unreadCount}</span>
            <span class="read-label">Read: ${readCount}</span>
        </div>

        ${
            totalCount === 0
            ? "<p>No notifications yet.</p>"
            : notifications.map(item => {
                const isRead = readIds.has(item.id);

                return `
                    <div class="notification-item ${isRead ? "read" : "unread"}">
                        <div class="notification-message">
                            ${escapeHTML(item.message)}
                        </div>

                        <small>
                            ${new Date(item.created_at).toLocaleString("en-IN")}
                        </small>

                        <strong class="${isRead ? "read-label" : "unread-label"}">
                            ${isRead ? "✓ Read" : "● Unread"}
                        </strong>

                        ${
                            !isRead
                            ? `<button class="btn btn-primary"
                                onclick="markEmergencyAsRead('${item.id}')">
                                Mark as Read
                               </button>`
                            : ""
                        }
                    </div>
                `;
            }).join("")
        }
    `;
}


    } catch (error) {
        console.error("NOTIFICATION LOAD ERROR:", error);
        if (list) {
            list.innerHTML = "<p>Unable to load notifications.</p>";
        }
    }
}


// Mark notification as read
async function markEmergencyAsRead(notificationId) {
    try {
        const { error } = await dbClient
            .from("emergency_notification_reads")
            .insert({
                notification_id: notificationId,
                user_id: currentProfile.id
            });

        if (error && error.code !== "23505") throw error;

        await loadEmergencyNotifications();

    } catch (error) {
        console.error("MARK READ ERROR:", error);
        showToast("Unable to update notification");
    }
}


// Realtime listener
function startEmergencyNotificationUpdates() {
    if (emergencyChannel) {
        dbClient.removeChannel(emergencyChannel);
    }

    emergencyChannel = dbClient
        .channel("emergency-notifications-live")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "emergency_notifications"
            },
            () => {
                loadEmergencyNotifications();
                showToast("New emergency notification received!");
            }
        )
        .subscribe();
}
function toggleNotificationPanel() {
    const panel = document.getElementById("notificationPanel");

    if (!panel) return;

    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";

    if (isHidden) loadEmergencyNotifications();
}