/* ============================================
   WAMAN-AHYAHA DONATION TRACKER — DATA LAYER
   ============================================
   All data persistence via localStorage.
   Structured for easy migration to a backend.
   ============================================ */

const DB = {
  KEYS: {
    APP_VERSION: '3.3.0',
    USERS: 'alayn_users',
    GROUPS: 'alayn_groups',
    DONATIONS: 'alayn_donations',
    ANNOUNCEMENTS: 'alayn_announcements',
    ORPHANS: 'alayn_orphans',
    CURRENT_USER: 'alayn_current_user',
    SETTINGS: 'alayn_settings',
    CAMPAIGN_REQUESTS: 'alayn_campaign_requests',
    SUPPORT_MESSAGES: 'alayn_support_messages',
    PAY_REPORTS: 'alayn_pay_reports',
  },

  // ── Phone number of the employee who reads support messages ──
  // Change this to any Iraqi phone number (the employee's login phone)
  SUPPORT_PHONE: '07700000000',
  SUPER_ADMIN_PHONE: '07700000000', // رقم هاتف المدير العام (فرهود)

  // --- Generic CRUD ---
  _get(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  },

  _set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  _getArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  },

  _setArray(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // --- ID generator ---
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  // ==============================
  // USERS
  // ==============================
  getUsers() {
    return this._get(this.KEYS.USERS);
  },

  getUser(userId) {
    return this.getUsers()[userId] || null;
  },

  isSuperAdmin(user) {
    return user && user.role === 'superadmin';
  },

  saveUser(user) {
    const users = this.getUsers();
    users[user.id] = user;
    this._set(this.KEYS.USERS, users);
    return user;
  },

  deleteUser(userId) {
    const users = this.getUsers();
    delete users[userId];
    this._set(this.KEYS.USERS, users);
  },

  getUsersByGroup(groupId) {
    const users = this.getUsers();
    return Object.values(users).filter(u => u.groupId === groupId);
  },

  getUsersByCollector(collectorId) {
    const users = this.getUsers();
    return Object.values(users).filter(u => u.collectorId === collectorId && u.role === 'donor');
  },

  getCollectorsByGroup(groupId) {
    const users = this.getUsers();
    return Object.values(users).filter(u => u.groupId === groupId && u.role === 'collector');
  },

  getAdminsByGroup(groupId) {
    const users = this.getUsers();
    return Object.values(users).filter(u => u.groupId === groupId && u.role === 'admin');
  },

  getDonorsByGroup(groupId) {
    const users = this.getUsers();
    return Object.values(users).filter(u => u.groupId === groupId && u.role === 'donor');
  },

  // ==============================
  // GROUPS
  // ==============================
  getGroups() {
    return this._get(this.KEYS.GROUPS);
  },

  getGroup(groupId) {
    return this.getGroups()[groupId] || null;
  },

  saveGroup(group) {
    const groups = this.getGroups();
    groups[group.id] = group;
    this._set(this.KEYS.GROUPS, groups);
    return group;
  },

  deleteGroup(groupId) {
    const groups = this.getGroups();
    delete groups[groupId];
    this._set(this.KEYS.GROUPS, groups);
  },

  getAllGroupsList() {
    return Object.values(this.getGroups());
  },

  // ==============================
  // DONATIONS
  // ==============================
  getDonations() {
    return this._get(this.KEYS.DONATIONS);
  },

  getDonationsForGroup(groupId) {
    const all = this.getDonations();
    return all[groupId] || {};
  },

  getDonationStatus(groupId, monthKey, userId) {
    const groupDonations = this.getDonationsForGroup(groupId);
    if (groupDonations[monthKey] && groupDonations[monthKey][userId]) {
      return groupDonations[monthKey][userId];
    }
    return null;
  },

  setDonationStatus(groupId, monthKey, userId, data) {
    const all = this.getDonations();
    if (!all[groupId]) all[groupId] = {};
    if (!all[groupId][monthKey]) all[groupId][monthKey] = {};
    all[groupId][monthKey][userId] = {
      paid: data.paid,
      amount: data.amount || 0,
      date: data.date || new Date().toISOString(),
      collectorId: data.collectorId || null,
    };
    this._set(this.KEYS.DONATIONS, all);
  },

  getMonthlyStats(groupId, monthKey) {
    const groupDonations = this.getDonationsForGroup(groupId);
    const monthData = groupDonations[monthKey] || {};
    const donors = this.getDonorsByGroup(groupId);
    
    let totalAmount = 0;
    let paidCount = 0;
    let totalExpected = 0;

    for (const donor of donors) {
      totalExpected += (donor.amount || 5000);
      const status = monthData[donor.id];
      if (status && status.paid) {
        paidCount++;
        totalAmount += status.amount || 0;
      }
    }

    return {
      totalDonors: donors.length,
      paidCount,
      unpaidCount: donors.length - paidCount,
      totalAmount,
      totalExpected,
      completionRate: totalExpected > 0 ? Math.round((totalAmount / totalExpected) * 100) : 0,
    };
  },

  // Calculate streak for a donor
  getDonorStreak(groupId, userId) {
    const groupDonations = this.getDonationsForGroup(groupId);
    const months = Object.keys(groupDonations).sort().reverse();
    let streak = 0;
    
    for (const month of months) {
      const status = groupDonations[month]?.[userId];
      if (status && status.paid) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },

  // ==============================
  // MANAGER INTELLIGENCE
  // ==============================
  getAtRiskDonors(groupId, collectorId = null) {
    const today = new Date();
    // Only flag donors if we are past the 5th day of the current month
    if (today.getDate() <= 5) return [];

    const months = this.getRecentMonths(2);
    if (months.length < 2) return [];

    const curMonth = months[0];
    const prevMonth = months[1];

    let donors = this.getDonorsByGroup(groupId);
    if (collectorId) {
      donors = donors.filter(d => d.collectorId === collectorId);
    }

    return donors.filter(d => {
      const paidLast = this.getDonationStatus(groupId, prevMonth, d.id)?.paid;
      const paidThis = this.getDonationStatus(groupId, curMonth, d.id)?.paid;
      return paidLast && !paidThis;
    });
  },

  // ==============================
  // ANNOUNCEMENTS
  // ==============================
  getAnnouncements() {
    return this._getArray(this.KEYS.ANNOUNCEMENTS);
  },

  getAnnouncementsByGroup(groupId) {
    return this.getAnnouncements().filter(a => a.groupId === groupId);
  },

  addAnnouncement(announcement) {
    const all = this.getAnnouncements();
    announcement.id = this.generateId();
    announcement.date = new Date().toISOString();
    all.unshift(announcement);
    this._setArray(this.KEYS.ANNOUNCEMENTS, all);
    return announcement;
  },

  deleteAnnouncement(announcementId) {
    let all = this.getAnnouncements();
    all = all.filter(a => a.id !== announcementId);
    this._setArray(this.KEYS.ANNOUNCEMENTS, all);
  },
  updateAnnouncement(id, data) {
    const all = this.getAnnouncements();
    const idx = all.findIndex(a => a.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data };
      this._setArray(this.KEYS.ANNOUNCEMENTS, all);
    }
  },

  // ==============================
  // AUDIT LOGS
  // ==============================
  logCollectorAction(groupId, monthKey, collectorId, actionType) {
    const key = `audit_${groupId}_${monthKey}`;
    const logs = this._get(key);
    if (!logs[collectorId]) logs[collectorId] = {};
    logs[collectorId][actionType] = new Date().toISOString();
    this._set(key, logs);
  },

  getLastCollectorAction(groupId, monthKey, collectorId, actionType) {
    const key = `audit_${groupId}_${monthKey}`;
    const logs = this._get(key);
    return logs[collectorId]?.[actionType] || null;
  },

  // ==============================
  // CURRENT USER / SESSION
  // ==============================
  getCurrentUser() {
    const userId = localStorage.getItem(this.KEYS.CURRENT_USER);
    return userId ? this.getUser(userId) : null;
  },

  setCurrentUser(userId) {
    localStorage.setItem(this.KEYS.CURRENT_USER, userId);
  },

  logout() {
    localStorage.removeItem(this.KEYS.CURRENT_USER);
  },

  // ==============================
  // SETTINGS
  // ==============================
  getSettings() {
    return this._get(this.KEYS.SETTINGS);
  },

  saveSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    this._set(this.KEYS.SETTINGS, settings);
  },

  getSetting(key, defaultValue) {
    const settings = this.getSettings();
    return settings[key] !== undefined ? settings[key] : defaultValue;
  },

  // ==============================
  // MONTH HELPERS
  // ==============================
  getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  getMonthLabel(monthKey, lang = 'ar') {
    const [year, month] = monthKey.split('-');
    const monthNames = {
      ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
           'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    };
    const names = monthNames[lang] || monthNames.ar;
    return `${names[parseInt(month) - 1]} ${year}`;
  },

  getRecentMonths(count = 6) {
    const months = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  },

  // ─────────────────────────────────────────────────────────
  // ORPHANS
  // ─────────────────────────────────────────────────────────
  getOrphans() {
    return JSON.parse(localStorage.getItem(this.KEYS.ORPHANS)) || [];
  },
  getOrphansByGroup(groupId) {
    if (!groupId) return this.getOrphans(); // superadmin default
    return this.getOrphans().filter(o => o.groupId === groupId);
  },
  saveOrphan(orphan) {
    if (!orphan.id) orphan.id = 'orph_' + Date.now() + Math.floor(Math.random()*1000);
    const tbl = this.getOrphans();
    const idx = tbl.findIndex(o => o.id === orphan.id);
    if (idx >= 0) tbl[idx] = orphan;
    else tbl.push(orphan);
    localStorage.setItem(this.KEYS.ORPHANS, JSON.stringify(tbl));
    return orphan.id;
  },
  deleteOrphan(id) {
    const tbl = this.getOrphans().filter(o => o.id !== id);
    localStorage.setItem(this.KEYS.ORPHANS, JSON.stringify(tbl));
  },

  // ─────────────────────────────────────────────────────────
  // SEED & UTIL
  // ─────────────────────────────────────────────────────────
  seedIfEmpty() {
    if (Object.keys(this.getGroups()).length > 0) return false;

    // Create groups
    const group1 = {
      id: 'grp_mustansiriya',
      name: 'حملة الجامعة المستنصرية (ومن أحياها)',
      university: 'الجامعة المستنصرية',
      orphansSponsored: 10,
      costPerOrphan: 25000,
      monthlyGoal: 250000,
      createdAt: '2025-09-01',
    };

    const group2 = {
      id: 'grp_mashreq',
      name: 'حملة جامعة المشرق (ومن أحياها)',
      university: 'جامعة المشرق',
      orphansSponsored: 5,
      costPerOrphan: 25000,
      monthlyGoal: 125000,
      createdAt: '2025-10-01',
    };

    const group3 = {
      id: 'grp_nahrain',
      name: 'حملة جامعة النهرين (ومن أحياها)',
      university: 'جامعة النهرين',
      orphansSponsored: 8,
      costPerOrphan: 25000,
      monthlyGoal: 200000,
      createdAt: '2025-08-01',
    };

    this.saveGroup(group1);
    this.saveGroup(group2);
    this.saveGroup(group3);

    // THE SUPER ADMIN (Manager)
    const superAdmin = {
      id: 'usr_superadmin',
      name: 'مدير التطبيق',
      phone: this.SUPER_ADMIN_PHONE,
      role: 'superadmin',
      pin: '1432',
      groupId: null,
      joinDate: '2025-01-01',
    };
    this.saveUser(superAdmin);

    // Create users for group 1 (Mustansiriya)
    const admin1 = {
      id: 'usr_admin1',
      name: 'أحمد المسؤول',
      phone: '07801234567',
      role: 'admin',
      pin: '0000',
      groupId: 'grp_mustansiriya',
      joinDate: '2025-09-01',
    };

    const collector1 = {
      id: 'usr_muhammad',
      name: 'محمد عباس',
      phone: '07811234567',
      role: 'collector',
      pin: '0000',
      groupId: 'grp_mustansiriya',
      joinDate: '2025-09-01',
      stage: 'المرحلة الخامسة',
      availability: {
        days: 'الأحد - الخميس',
        startTime: '09:00',
        endTime: '12:00',
        location: 'كلية الهندسة - الطابق الثاني',
      },
    };

    const collector2 = {
      id: 'usr_ali',
      name: 'علي حسين',
      phone: '07823456789',
      role: 'collector',
      pin: '0000',
      groupId: 'grp_nahrain',
      joinDate: '2025-02-16',
      stage: 'المرحلة الأولى',
      availability: {
        days: 'الأحد - الأربعاء',
        startTime: '10:00',
        endTime: '14:00',
        location: 'كلية العلوم - الطابق الأول',
      },
    };

    const collector3 = {
      id: 'usr_hassan',
      name: 'حسن كاظم',
      phone: '07831234567',
      role: 'collector',
      pin: '0000',
      groupId: 'grp_mustansiriya',
      joinDate: '2025-10-01',
      stage: 'المرحلة الثالثة',
      availability: {
        days: 'الاثنين - الخميس',
        startTime: '08:00',
        endTime: '11:00',
        location: 'كلية الإدارة والاقتصاد',
      },
    };

    // Donors under collector1 (Muhammad)
    const donors1 = [
      { id: 'usr_d1', name: 'مريم جاسم', phone: '07901234567', collectorId: 'usr_muhammad', amount: 10000 },
      { id: 'usr_d2', name: 'زينب علي', phone: '07911234567', collectorId: 'usr_muhammad', amount: 5000 },
      { id: 'usr_d3', name: 'أحمد صالح', phone: '07921234567', collectorId: 'usr_muhammad', amount: 25000 },
      { id: 'usr_d4', name: 'عمر خالد', phone: '07931234567', collectorId: 'usr_muhammad', amount: 10000 },
      { id: 'usr_d5', name: 'فاطمة حسن', phone: '07941234567', collectorId: 'usr_muhammad', amount: 5000 },
    ];

    // Donors under collector2 (Ali)
    const donors2 = [
      { id: 'usr_d6', name: 'سارة أحمد', phone: '07951234567', collectorId: 'usr_ali', amount: 10000 },
      { id: 'usr_d7', name: 'ياسر محمود', phone: '07961234567', collectorId: 'usr_ali', amount: 5000 },
      { id: 'usr_d8', name: 'نور حيدر', phone: '07971234567', collectorId: 'usr_ali', amount: 15000 },
      { id: 'usr_d9', name: 'علي رضا', phone: '07981234567', collectorId: 'usr_ali', amount: 10000 },
    ];

    // Donors under collector3 (Hassan)
    const donors3 = [
      { id: 'usr_d10', name: 'حسين عادل', phone: '07991234567', collectorId: 'usr_hassan', amount: 5000 },
      { id: 'usr_d11', name: 'رقية كريم', phone: '07801234568', collectorId: 'usr_hassan', amount: 10000 },
      { id: 'usr_d12', name: 'كرار مهدي', phone: '07811234568', collectorId: 'usr_hassan', amount: 5000 },
    ];

    // Save all users
    this.saveUser(admin1);
    this.saveUser(collector1);
    this.saveUser(collector2);
    this.saveUser(collector3);

    const allDonors = [...donors1, ...donors2, ...donors3];
    for (const d of allDonors) {
      this.saveUser({
        ...d,
        role: 'donor',
        groupId: 'grp_mustansiriya',
        joinDate: '2025-09-01',
      });
    }

    // Create sample users for other groups
    const mashreqAdmin = {
      id: 'usr_mashreq_admin',
      name: 'كاظم العبيدي',
      phone: '07821234567',
      role: 'admin',
      pin: '0000',
      groupId: 'grp_mashreq',
      joinDate: '2025-01-10',
    };
    this.saveUser(mashreqAdmin);

    const nahrainAdmin = {
      id: 'usr_nahrain_admin',
      name: 'ليلى المهندس',
      phone: '07831234567',
      role: 'admin',
      pin: '0000',
      groupId: 'grp_nahrain',
      joinDate: '2025-02-15',
    };
    this.saveUser(nahrainAdmin);

    // Seed donation data (past 6 months)
    const months = this.getRecentMonths(6);
    
    // Mustansiriya group donations
    for (const month of months) {
      for (const donor of allDonors) {
        // Randomly mark some as paid (80% chance for older months, 60% for current)
        const isCurrentMonth = month === this.getCurrentMonthKey();
        const chance = isCurrentMonth ? 0.6 : 0.85;
        const paid = Math.random() < chance;
        
        this.setDonationStatus('grp_mustansiriya', month, donor.id, {
          paid,
          amount: paid ? donor.amount : 0,
          date: paid ? `${month}-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, '0')}` : null,
          collectorId: donor.collectorId,
        });
      }
    }

    // Sample announcements
    this.addAnnouncement({
      groupId: 'grp_mustansiriya',
      authorId: 'usr_muhammad',
      authorName: 'محمد عباس',
      type: 'availability',
      title: 'أوقات استلام تبرعات حساب العين',
      content: 'سأكون متواجداً في كلية الهندسة - الطابق الثاني لاستلام تبرعاتكم المخصصة لحساب العين من الساعة 9 صباحاً إلى 12 ظهراً، من يوم الأحد إلى الخميس.',
    });

    this.addAnnouncement({
      groupId: 'grp_mustansiriya',
      authorId: 'usr_admin1',
      authorName: 'أحمد المسؤول',
      type: 'news',
      title: 'اكتمال تبرعات شهر فبراير — ومن أحياها',
      content: 'بفضل الله ثم بفضل جهودكم، تمكنا من جمع كافة تبرعات حساب العين لشهر فبراير عبر تطبيق ومن أحياها. شكراً لكل متبرع ساهم في كفالة الأيتام.',
      date: new Date(Date.now() - 5*24*60*60*1000).toISOString()
    });

    // Seed Orphans
    const orphans = [
      { id: 'orph_1', groupId: 'grp_mustansiriya', name: 'عبد الله حسين ميروز السويدي', code: 'AAA13303-8', province: 'بغداد', type: 'اعتيادية', amount: 95000, birthDate: '2010-06-12' },
      { id: 'orph_2', groupId: 'grp_mustansiriya', name: 'مصطفى محمد سلمان مطر العتابي', code: 'AAA55326-6', province: 'ذي قار', type: 'اعتيادية', amount: 95000, birthDate: '2011-12-24' },
      { id: 'orph_3', groupId: 'grp_mustansiriya', name: 'عباس عمار شمال نعناع الحسيناوي', code: 'AAA15003-8', province: 'بغداد', type: 'اعتيادية', amount: 95000, birthDate: '2012-10-28' }
    ];
    orphans.forEach(o => this.saveOrphan(o));

    return true; // seeded
  },

  // ==============================
  // EXPORT / IMPORT
  // ==============================
  exportAll() {
    return {
      users: this.getUsers(),
      groups: this.getGroups(),
      donations: this.getDonations(),
      announcements: this.getAnnouncements(),
      exportDate: new Date().toISOString(),
    };
  },

  importAll(data) {
    if (data.users) this._set(this.KEYS.USERS, data.users);
    if (data.groups) this._set(this.KEYS.GROUPS, data.groups);
    if (data.donations) this._set(this.KEYS.DONATIONS, data.donations);
    if (data.announcements) this._setArray(this.KEYS.ANNOUNCEMENTS, data.announcements);
  },

  clearAll() {
    Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
  },

  // ==============================
  // LEADERBOARD
  // ==============================
  getLeaderboard() {
    const groups = this.getAllGroupsList();
    const currentMonth = this.getCurrentMonthKey();
    
    return groups.map(group => {
      const stats = this.getMonthlyStats(group.id, currentMonth);
      const donors = this.getDonorsByGroup(group.id);
      
      // Calculate total all-time donations
      const allDonations = this.getDonationsForGroup(group.id);
      let allTimeTotal = 0;
      for (const month of Object.values(allDonations)) {
        for (const donation of Object.values(month)) {
          if (donation.paid) allTimeTotal += donation.amount || 0;
        }
      }

      return {
        ...group,
        currentMonthStats: stats,
        totalDonors: donors.length,
        allTimeTotal,
        score: stats.completionRate,
      };
    }).sort((a, b) => b.score - a.score);
  },

  // ==============================
  // CAMPAIGN REQUESTS
  // ==============================
  saveCampaignRequest(req) {
    const reqs = this._getArray(this.KEYS.CAMPAIGN_REQUESTS);
    req.id = this.generateId();
    req.createdAt = new Date().toISOString();
    reqs.push(req);
    this._setArray(this.KEYS.CAMPAIGN_REQUESTS, reqs);
    return req;
  },

  getCampaignRequests() {
    return this._getArray(this.KEYS.CAMPAIGN_REQUESTS);
  },

  // ==============================
  // SUPPORT MESSAGES (Private)
  // ==============================
  saveSupportMessage(msg) {
    const msgs = this._getArray(this.KEYS.SUPPORT_MESSAGES);
    msg.id = this.generateId();
    msg.createdAt = new Date().toISOString();
    msgs.push(msg);
    this._setArray(this.KEYS.SUPPORT_MESSAGES, msgs);
    return msg;
  },

  getSupportMessages() {
    return this._getArray(this.KEYS.SUPPORT_MESSAGES);
  },

  deleteSupportMessage(id) {
    const msgs = this._getArray(this.KEYS.SUPPORT_MESSAGES).filter(m => m.id !== id);
    this._setArray(this.KEYS.SUPPORT_MESSAGES, msgs);
  },

  // ==============================
  // CROSS-COLLECTOR PAY REPORTS
  // ==============================
  getPayReports(groupId) {
    const all = this._getArray(this.KEYS.PAY_REPORTS);
    return groupId ? all.filter(r => r.groupId === groupId) : all;
  },

  savePayReport(report) {
    const all = this._getArray(this.KEYS.PAY_REPORTS);
    report.id = this.generateId();
    report.createdAt = new Date().toISOString();
    report.acknowledged = false;
    all.push(report);
    this._setArray(this.KEYS.PAY_REPORTS, all);
    return report;
  },

  acknowledgePayReport(reportId) {
    const all = this._getArray(this.KEYS.PAY_REPORTS);
    const idx = all.findIndex(r => r.id === reportId);
    if (idx >= 0) {
      all[idx].acknowledged = true;
      all[idx].acknowledgedAt = new Date().toISOString();
      this._setArray(this.KEYS.PAY_REPORTS, all);
      return all[idx];
    }
    return null;
  },
};
