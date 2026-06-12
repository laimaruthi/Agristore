# Firebase Setup Guide for AgriStore Cloud Sync

This guide will help you set up **your own private Firebase project** to enable cloud sync and backup features in AgriStore.

---

## 🔒 Why Your Own Firebase?

**Each customer creates their own Firebase project.** This means:

✅ **100% Private** - Only YOU have access to your data  
✅ **Complete Control** - You own the database, not the software vendor  
✅ **No Data Mixing** - Your data is completely separate from other stores  
✅ **Free Forever** - Firebase free tier is enough for most stores  
✅ **Your Google Account** - Linked to your own Google account  

> **Important:** We do NOT provide a shared Firebase. Each store owner creates their own Firebase project using their Google account. This is the most secure approach!

---

## 📋 What You'll Need

- A Google account (Gmail)
- Internet connection
- 10-15 minutes of time

---

## 🚀 Step-by-Step Setup

### Step 1: Create a Firebase Project

1. **Go to Firebase Console**
   - Open your browser and visit: [https://console.firebase.google.com](https://console.firebase.google.com)
   - Sign in with your Google account

2. **Create New Project**
   - Click **"Create a project"** or **"Add project"**
   - Enter a project name (e.g., `my-agristore` or `krishna-agro-store`)
   - Click **Continue**

3. **Google Analytics (Optional)**
   - You can disable Google Analytics for this project (not required)
   - Click **Create project**
   - Wait for the project to be created (takes about 30 seconds)
   - Click **Continue** when done

---

### Step 2: Enable Realtime Database

1. **Open Realtime Database**
   - In the left sidebar, click **Build** → **Realtime Database**
   - Click **Create Database**

2. **Choose Location**
   - Select a location closest to you:
     - For India: Choose **Singapore (asia-southeast1)** or **Mumbai** if available
     - For other regions: Choose the nearest location
   - Click **Next**

3. **Set Security Rules**
   - Select **"Start in test mode"** (we'll update this later)
   - Click **Enable**

---

### Step 3: Get Your Firebase Configuration

1. **Go to Project Settings**
   - Click the **gear icon ⚙️** next to "Project Overview" in the left sidebar
   - Select **Project settings**

2. **Register Your App**
   - Scroll down to **"Your apps"** section
   - Click the **Web icon** `</>`
   - Enter an app nickname (e.g., `AgriStore Desktop`)
   - Don't check "Firebase Hosting"
   - Click **Register app**

3. **Copy Configuration**
   - You'll see a code block with your Firebase configuration
   - Copy each value to enter in AgriStore:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",           // Copy this
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",  // Copy this
  projectId: "your-project-id",  // Copy this
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

**Important Values to Copy:**
- `apiKey` - Your API key
- `databaseURL` - Your database URL (starts with `https://`)
- `projectId` - Your project ID

---

### Step 4: Configure Security Rules (Recommended)

For better security, update your database rules:

1. Go to **Realtime Database** → **Rules** tab

2. Replace the rules with:

```json
{
  "rules": {
    "stores": {
      "$storeId": {
        ".read": true,
        ".write": true
      }
    },
    "backups": {
      "$storeId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

3. Click **Publish**

---

### Step 5: Enter Configuration in AgriStore

1. Open **AgriStore** application
2. Go to **Settings** → **Cloud Sync**
3. Click **Setup Firebase Sync**
4. Enter the values you copied:
   - **API Key**: Paste your `apiKey`
   - **Database URL**: Paste your `databaseURL`
   - **Project ID**: Paste your `projectId`
5. Click **Save & Test Connection**

---

## ✅ Verify Setup

After configuration:

1. Click **Sync Now** in AgriStore
2. Check your Firebase Console → Realtime Database
3. You should see your store data under `stores/your-store-id`

---

## 🔒 Security Best Practices

### Your Data is 100% Private

Since you created your own Firebase project:
- **Only you** have the API keys
- **Only you** can access the Firebase Console
- **Only you** can see or modify the data
- **No one else** (not even AgriStore developers) can access your data

### Recommended: Keep Your Config Private

Your Firebase configuration (API Key, Database URL, Project ID) is like a password:
- ❌ Don't share it with others
- ❌ Don't post it online
- ✅ Keep it only on your computers
- ✅ Use the same config on all YOUR devices only

### Option 1: Basic Security (Default)
Use the rules provided in Step 4. Since only you have your Firebase config, only your AgriStore apps can sync.

### Option 2: Add Password Protection
Add a sync password in AgriStore settings. Data will be encrypted before upload for extra security.

### Option 3: Advanced Security (For Tech Users)
Add authentication rules:

```json
{
  "rules": {
    "stores": {
      "$storeId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

Then enable **Anonymous Authentication**:
1. Go to **Build** → **Authentication**
2. Click **Get started**
3. Enable **Anonymous** sign-in

---

## 📱 Multi-Device Sync

To sync between multiple computers **in your store**:

1. Set up Firebase once (follow steps above)
2. On each computer, enter the **same** Firebase configuration
3. Use the **same Store ID** on all devices
4. Click **Sync** to upload/download data

**Important:** 
- Only sync one direction at a time to avoid conflicts
- The most recent sync will overwrite older data
- Only share your Firebase config with YOUR devices, not other stores

---

## 💾 Automatic Backups

Firebase automatically creates backups. To restore:

1. Go to **Settings** → **Cloud Sync**
2. Click **View Backups**
3. Select a backup date
4. Click **Restore**

---

## ❓ Troubleshooting

### "Connection Failed" Error
- Check your internet connection
- Verify the Database URL is correct
- Make sure Realtime Database is enabled

### "Permission Denied" Error
- Update your database rules (Step 4)
- Make sure rules are published

### "Invalid API Key" Error
- Double-check the API key copied correctly
- No extra spaces before/after

### Data Not Syncing
- Click "Sync Now" manually
- Check Firebase Console for data
- Ensure Store ID matches on all devices

---

## 🆘 Need Help?

If you encounter issues:

1. **Check Firebase Status**: [status.firebase.google.com](https://status.firebase.google.com)
2. **Screenshot your Firebase Console** and contact support
3. **Verify all configuration values** are entered correctly

---

## 📊 Firebase Free Tier Limits

Firebase Spark (Free) Plan includes:
- **1 GB** database storage
- **10 GB/month** data download
- **100** simultaneous connections

This is more than enough for most stores!

---

## 🔄 Switching to a New Firebase Project

If you need to create a new Firebase project:

1. Export your data first (Settings → Backup → Export)
2. Create new Firebase project (follow this guide)
3. Enter new configuration in AgriStore
4. Import your data (Settings → Backup → Import)

---

## ❓ Frequently Asked Questions

### Q: Can other stores see my data?
**No.** Each store has their own Firebase project. Your data is completely private.

### Q: Can AgriStore developers see my data?
**No.** You created the Firebase project with YOUR Google account. Only you have access.

### Q: What if I lose my Firebase config?
You can always get it again from [Firebase Console](https://console.firebase.google.com) by logging in with your Google account.

### Q: Is Firebase free?
**Yes.** The free tier includes 1GB storage and 10GB/month downloads - more than enough for most stores.

### Q: Can I delete my Firebase project?
**Yes.** You have complete control. Go to Firebase Console → Project Settings → Delete Project.

---

*Document Version: 1.0 | Last Updated: April 2026*
