/* ============================================
   WAMAN-AHYAHA DONATION TRACKER — AUTH MODULE
   ============================================ */

const Auth = {
  // Get current logged in user
  currentUser() {
    return DB.getCurrentUser();
  },

  isLoggedIn() {
    return !!this.currentUser();
  },

  // Login with phone number and optional PIN
  login(phone, pin = null) {
    const users = DB.getUsers();
    const user = Object.values(users).find(u => u.phone === phone);
    
    if (!user) return { error: 'not_found' };

    // Require PIN for privileged roles
    if (['superadmin', 'admin', 'collector'].includes(user.role)) {
      if (pin === null || pin === '') return { require_pin: true, user };
      if (String(user.pin) !== String(pin)) return { error: 'wrong_pin' };
    }

    DB.setCurrentUser(user.id);
    return { success: true, user };
  },

  // Register a new donor
  registerDonor(data) {
    const user = {
      id: DB.generateId(),
      name: data.name,
      phone: data.phone,
      role: 'donor',
      groupId: data.groupId,
      collectorId: data.collectorId,
      amount: data.amount || 0,
      isAnonymous: !!data.isAnonymous,
      joinDate: new Date().toISOString().split('T')[0],
    };
    DB.saveUser(user);
    DB.setCurrentUser(user.id);
    return user;
  },

  // Register a new collector (requires admin)
  registerCollector(data) {
    const user = {
      id: DB.generateId(),
      name: data.name,
      phone: data.phone,
      role: 'collector',
      pin: data.pin || '0000',
      groupId: data.groupId,
      joinDate: new Date().toISOString().split('T')[0],
      stage: data.stage || '',
      availability: data.availability || null,
    };
    DB.saveUser(user);
    return user;
  },

  // Create a new group (and make the creator admin)
  createGroup(groupData, adminData) {
    const group = {
      id: DB.generateId(),
      name: groupData.name,
      university: groupData.university,
      icon: groupData.icon || 'building',
      orphansSponsored: groupData.orphansSponsored || 1,
      costPerOrphan: groupData.costPerOrphan || 25000,
      monthlyGoal: (groupData.orphansSponsored || 1) * (groupData.costPerOrphan || 25000),
      createdAt: new Date().toISOString().split('T')[0],
    };
    DB.saveGroup(group);

    const admin = {
      id: DB.generateId(),
      name: adminData.name,
      phone: adminData.phone,
      role: 'admin',
      pin: adminData.pin || '0000',
      groupId: group.id,
      joinDate: new Date().toISOString().split('T')[0],
    };
    DB.saveUser(admin);
    DB.setCurrentUser(admin.id);

    return { group, admin };
  },

  logout() {
    DB.logout();
  },

  isSuperAdmin() {
    const user = this.currentUser();
    return user && user.role === 'superadmin';
  },

  isAdmin() {
    const user = this.currentUser();
    return user && (user.role === 'admin' || user.role === 'superadmin');
  },

  isCollector() {
    const user = this.currentUser();
    return user && user.role === 'collector';
  },

  isDonor() {
    const user = this.currentUser();
    return user && user.role === 'donor';
  },

  canManageDonations() {
    return this.isSuperAdmin() || this.isAdmin() || this.isCollector();
  },

  canPostAnnouncements() {
    return this.isSuperAdmin() || this.isAdmin() || this.isCollector();
  },
};
