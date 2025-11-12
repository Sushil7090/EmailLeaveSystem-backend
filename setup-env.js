#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment variables for Email Management Backend...\n');

const envContent = `# Database Configuration
DBCONNECT=mongodb://localhost:27017/email_management

# JWT Secret for authentication (CHANGE THIS IN PRODUCTION!)
JWTSECRET=dev_jwt_secret_key_12345_change_me

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend Base URL
FRONTEND_BASE_URL=http://localhost:8080

# CORS Origin
CORS_ORIGIN=http://localhost:8080

# Port
PORT=5001

# Environment
NODE_ENV=development

# Serve Frontend (only in production)
SERVE_FRONTEND=false
`;

const envPath = path.join(__dirname, '.env');

try {
    // Check if .env already exists
    if (fs.existsSync(envPath)) {
        console.log('⚠️  .env file already exists!');
        console.log('📁 Location:', envPath);
        console.log('\n💡 If you want to recreate it, delete the existing file first.');
        return;
    }

    // Create .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully!');
    console.log('📁 Location:', envPath);
    console.log('\n📝 Next steps:');
    console.log('1. Edit the .env file with your actual values');
    console.log('2. Make sure MongoDB is running on localhost:27017');
    console.log('3. Update EMAIL_USER, EMAIL_PASS, and GEMINI_API_KEY');
    console.log('4. Run: npm run dev');
    
} catch (error) {
    console.error('❌ Error creating .env file:', error.message);
    console.log('\n💡 You can manually create a .env file in the Backend directory with the content above.');
}
