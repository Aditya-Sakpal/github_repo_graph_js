import express from "express";
import axios from "axios";
import { Country, City } from "country-state-city";
import redisClient from "./redisClient.js";
import pool from "./db.js"; // ✅ Import db connection
import OpenAI from "openai";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import FormData from 'form-data';
dotenv.config();

// Get current directory for ES modules
const __filename= fileURLToPath(import.meta.url);
const __dirname= path.dirname(__filename);

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Global error handling middleware for JSON parsing
app.use(express.json({ limit: '10mb' }));

// Global error handler for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON Parse Error:', err.message);
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next(err);
});

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN = "VERIFY_TOKEN";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_PASSWORD
  }
});

async function validateWithOpenAI(userInput, currentStep, sessionData = {}) {
  try {
    const systemPrompt = `You are a validation assistant for Meraki Sports registration flow. The user goes through these steps:
1. ASK_NAME: User provides their name
2. ASK_EMAIL: User provides their email address  
3. ASK_CITY: User provides their city (must be in India)
4. ASK_CODE: User provides a stratch code

Current step: ${currentStep}
Session data: ${JSON.stringify(sessionData)}

IMPORTANT: Users may provide information in conversational format or complete sentences. You must intelligently EXTRACT the relevant information from their text.

Examples:
- "here's my email: aditya.sakpal2081@gmail.com" → extract "aditya.sakpal2081@gmail.com"
- "My nameis John Smith" → extract "John Smith"
- "I live in Mumbai, India" → extract "Mumbai"
- "The code is ABC123" → extract "ABC123"

For each validation, return a JSON response with:
{
  "message": "success/error message with next step if valid",
  "is_valid": true/false,
  "value": "extracted_clean_value_or_empty_string"
}

Validation rules:
- NAME: Minimum 2 characters, no numbers or special characters except spaces, hyphens, apostrophes. Extract the actual namefrom conversational text.
- EMAIL: Valid email format ONLY. Extract email address from any text that contains it. Do NOT check if email exists or is already registered.
- CITY: Must be a city in India. Extract city namefrom conversational text, even if mentioned with state/country.
- CODE: Must be exactly 6 characters, alphanumeric combination of letters and numbers. Extract the code from conversational text. Do NOT check if code exists in database.

If valid:
- message: Energetic message + what's needed next (except for code validation)
- is_valid: true
- value: cleaned/extracted value (ONLY the relevant data, not the full sentence)

If invalid:
- message: Explain why invalid + ask for correct input
- is_valid: false  
- value: ""`;

    const userPrompt = `Current step: ${currentStep}
User input: "${userInput}"

Validate this input according to the current step requirements.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    console.log(`OpenAI validation result for ${currentStep}:`, result);
    return result;

  } catch (error) {
    console.error("OpenAI validation error:", error);
    return {
      message: "Sorry, I'm having trouble processing your input. Please try again.",
      is_valid: false,
      value: ""
    };
  }
}

// Legacy validation functions (kept as fallback)
function validateEmail(email) {
  try {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return false;
    }
    
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  } catch (error) {
    console.error('Error validating email:', error.message);
    return false;
  }
}

function validateCity(input) {
  try {
    if (!input || typeof input !== 'string') {
      return false;
    }
    
    const normalized = input.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    
    const indianCities = City.getCitiesOfCountry("IN");
    if (!indianCities || indianCities.length === 0) {
      console.warn('No cities found for India');
      return false;
    }
    
    return indianCities.some(c => c.name && c.name.toLowerCase() === normalized);
  } catch (error) {
    console.error('Error validating city:', error.message);
    return false;
  }
}

async function sendText(to, body) {
  try {
    if (!to || !body) {
      throw new Error('Phone number and message body are required');
    }
    
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured');
    }

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    console.log(`✅ WhatsApp message sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${to}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Re-throw the error so calling functions can handle it
    throw new Error(`WhatsApp API Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function sendVideoMessage(to, videoPath, caption = '') {
  try {
    if (!to || !videoPath) {
      throw new Error('Phone number and video path are required');
    }
    
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured');
    }

    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Get file stats for validation
    const stats = fs.statSync(videoPath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    // WhatsApp has a 16MB limit for videos
    if (fileSizeInMB > 16) {
      throw new Error(`Video file too large: ${fileSizeInMB.toFixed(2)}MB (max 16MB)`);
    }

    console.log(`📹 Sending video (${fileSizeInMB.toFixed(2)}MB) to ${to}`);
    
    // Step 1: Upload media to WhatsApp
    const formData = new FormData();
    formData.append('file', fs.createReadStream(videoPath));
    formData.append('type', 'video/mp4');
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        },
        timeout: 30000, // 30 second timeout for video upload
      }
    );

    const mediaId = uploadResponse.data.id;
    console.log(`✅ Video uploaded, media ID: ${mediaId}`);

    // Step 2: Send video message
    const videoMessagePayload = {
      messaging_product: "whatsapp",
      to: to,
      type: "video",
      video: {
        id: mediaId,
        caption: caption
      }
    };

    const sendResponse = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      videoMessagePayload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Video message sent to ${to}`);
    return { success: true, message: 'Video sent successfully', mediaId };

  } catch (error) {
    console.error(`❌ Failed to send video to ${to}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    throw new Error(`WhatsApp Video Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function sendWhatsAppTemplate(to, templateName, languageCode = "en", templateParams = {}) {
  try {
    if (!to || !templateName) {
      throw new Error('Phone number and template name are required');
    }
    
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured');
    }

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode
        }
      }
    };

    // Add template parameters if provided
    if (templateParams && Object.keys(templateParams).length > 0) {
      payload.template.components = [
        {
          type: "body",
          parameters: Object.values(templateParams).map(value => ({
            type: "text",
            text: value
          }))
        }
      ];
    }

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log(`✅ WhatsApp template "${templateName}" sent to ${to}`);
    return response.data;

  } catch (error) {
    console.error(`❌ Failed to send WhatsApp template to ${to}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    throw new Error(`WhatsApp Template Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function updateCodeInDatabase({ phone, name, email, city, code }) {
  try {
    console.log("Updating code in DB:", { phone, name, email, city, code });
    
    // Update the codes table with user details and mark as inactive
    const result = await pool.query(
      `UPDATE codes 
       SET phone_number = $1, "name" = $2, email = $3, city = $4, status = 'inactive', created_at = NOW()
       WHERE code = $5 AND status = 'active'
       RETURNING *`,
      [phone, name, email, city, code]
    );
    
    if (result.rows.length > 0) {
      console.log("Code successfully updated:", result.rows[0]);
      return true;
    } else {
      console.log("No active code found to update");
      return false;
    }
  } catch (err) {
    console.error("Database update error:", err.message);
    throw err;
  }
}

// API endpoint to get statistics
app.get("/api/stats", async (req, res) => {
  try {
    // Get total registrations (inactive codes)
    const totalRegistrationsResult = await pool.query(
      "SELECT COUNT(*) as total FROM codes WHERE status = 'inactive'"
    );
    const totalRegistrations = parseInt(totalRegistrationsResult.rows[0].total);

    // Get the date range for calculating scans per day
    const dateRangeResult = await pool.query(
      `SELECT 
        MIN(created_at) as first_registration,
        MAX(created_at) as last_registration
       FROM codes 
       WHERE status = 'inactive' AND created_at IS NOT NULL`
    );

    let codeScansPerDay = 0;
    if (dateRangeResult.rows[0].first_registration && dateRangeResult.rows[0].last_registration) {
      const firstDate = new Date(dateRangeResult.rows[0].first_registration);
      const lastDate = new Date(dateRangeResult.rows[0].last_registration);
      
      // Calculate difference in days
      const timeDifference = lastDate.getTime() - firstDate.getTime();
      const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24)) || 1; // At least 1 day
      
      codeScansPerDay = Math.round(totalRegistrations / daysDifference);
    }

    // Get winners from database
    const winnersResult = await pool.query(
      `SELECT "name" as name, phone_number as phone, city
       FROM codes 
       WHERE status = 'inactive' AND is_winner = true
       ORDER BY created_at DESC`
    );
    console.log("winnersResult",winnersResult);
    const winnersSelected = winnersResult.rows.map(row => ({
      name: row.name? row.name.trim() : 'N/A',
      phone: row.phone || 'N/A',
      city: row.city || 'N/A'
    }));

    res.json({
      registrations: totalRegistrations,
      codeScansPerDay: codeScansPerDay,
      winnersSelected: winnersSelected
    });

  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// API endpoint to get chart data
app.get("/api/charts", async (req, res) => {
  try {
    // Get daily registrations data
    const dailyRegistrationsResult = await pool.query(
      `SELECT 
        DATE(created_at) as registration_date,
        COUNT(*) as count
       FROM codes 
       WHERE status = 'inactive' AND created_at IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY registration_date ASC`
    );

    // Format daily data for chart (MM-DD format)
    const daily = dailyRegistrationsResult.rows.map(row => ({
      date: new Date(row.registration_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
      count: parseInt(row.count)
    }));

    // Get city-wise participation data
    const cityRegistrationsResult = await pool.query(
      `SELECT 
        city,
        COUNT(*) as value
       FROM codes 
       WHERE status = 'inactive' AND city IS NOT NULL AND city != ''
       GROUP BY city
       ORDER BY value DESC`
    );

    // Format city data for pie chart
    const city = cityRegistrationsResult.rows.map(row => ({
      name: row.city,
      value: parseInt(row.value)
    }));

    // Get total registrations for contest performance
    const totalRegistrationsResult = await pool.query(
      "SELECT COUNT(*) as total FROM codes WHERE status = 'inactive'"
    );
    const totalRegistrations = parseInt(totalRegistrationsResult.rows[0].total);

    // Contest performance data (single bar for Maidan 72)
    const performance = [
      { contest: "Maidan 72", value: totalRegistrations }
    ];

    res.json({
      daily,
      city,
      performance
    });

  } catch (error) {
    console.error("Error fetching chart data:", error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// API endpoint to get recent activity data
app.get("/api/recent-activity", async (req, res) => {
  try {
    // Get all inactive codes with user details, ordered by most recent first
    const recentActivityResult = await pool.query(
      `SELECT 
        code_id as id,
        "name" as name,
        phone_number as phone,
        city,
        email,
        code,
        created_at,
        is_winner,
        DATE(created_at) as date
       FROM codes 
       WHERE status = 'inactive' 
         AND "name" IS NOT NULL 
         AND phone_number IS NOT NULL 
         AND city IS NOT NULL
         AND created_at IS NOT NULL
       ORDER BY created_at DESC`
    );

    // Format data for the table
    const entries = recentActivityResult.rows.map(row => ({
      id: row.id,
      name: row.name? row.name.trim() : 'N/A', // Trim whitespace from name
      phone: row.phone || 'N/A',
      city: row.city || 'N/A',
      status: "Registered", // All inactive codes are considered registered
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : 'N/A', // Format as YYYY-MM-DD
      email: row.email || 'N/A',
      code: row.code || 'N/A',
      isWinner: row.is_winner || false
    }));

    res.json({ entries });

  } catch (error) {
    console.error("Error fetching recent activity data:", error);
    res.status(500).json({ error: "Failed to fetch recent activity data" });
  }
});

// API endpoint to update winners
app.post("/api/update-winners", async (req, res) => {
  try {
    const { winnerIds } = req.body;

    if (!winnerIds || !Array.isArray(winnerIds) || winnerIds.length === 0) {
      return res.status(400).json({ error: "Winner IDs are required" });
    }

    console.log("Updating winners:", winnerIds);

    // First, reset all is_winner flags to false
    await pool.query("UPDATE codes SET is_winner = false WHERE status = 'inactive'");

    // Then set is_winner = true for selected winners
    const placeholders = winnerIds.map((_, index) => `$${index + 1}`).join(',');
    const updateResult = await pool.query(
      `UPDATE codes 
       SET is_winner = true 
       WHERE code_id IN (${placeholders}) AND status = 'inactive'
       RETURNING code_id, "name", phone_number, city`,
      winnerIds
    );

    console.log("Winners updated:", updateResult.rows);

    res.json({ 
      success: true, 
      updatedCount: updateResult.rows.length,
      winners: updateResult.rows.map(row => ({
        id: row.code_id,
        name: row.name? row.name.trim() : 'N/A',
        phone: row.phone_number || 'N/A',
        city: row.city || 'N/A'
      }))
    });

  } catch (error) {
    console.error("Error updating winners:", error);
    res.status(500).json({ error: "Failed to update winners" });
  }
});

// API endpoint to delete a registration by phone number
app.delete("/api/registration/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    console.log(`Attempting to delete registration for phone: ${phone}`);

    // Delete the record from codes table
    const result = await pool.query(
      "DELETE FROM codes WHERE phone_number = $1 RETURNING *",
      [phone]
    );

    if (result.rows.length > 0) {
      const deletedRecord = result.rows[0];
      console.log("Registration deleted successfully:", {
        phone: deletedRecord.phone_number,
        name: deletedRecord.name,
        email: deletedRecord.email,
        city: deletedRecord.city,
        code: deletedRecord.code
      });

      res.json({ 
        success: true, 
        message: "Registration deleted successfully",
        deletedRecord: {
          phone: deletedRecord.phone_number,
          name: deletedRecord.name,
          email: deletedRecord.email,
          city: deletedRecord.city,
          code: deletedRecord.code
        }
      });
    } else {
      console.log(`No registration found for phone: ${phone}`);
      res.status(404).json({ 
        error: "No registration found for this phone number" 
      });
    }

  } catch (error) {
    console.error("Error deleting registration:", error);
    res.status(500).json({ 
      error: "Failed to delete registration",
      details: error.message 
    });
  }
});

// API endpoint to send winner emails and WhatsApp messages
app.post("/api/send-winner-emails", async (req, res) => {
  try {
    // Get all winners from database
    const winnersResult = await pool.query(
      `SELECT code_id, "name" as name, email, phone_number, city, code
       FROM codes 
       WHERE status = 'inactive' AND is_winner = true
       ORDER BY created_at DESC`
    );

    const winners = winnersResult.rows;
    
    if (winners.length === 0) {
      return res.status(400).json({ 
        error: "No winners found" 
      });
    }

    console.log(`Sending notifications to ${winners.length} winners`);

    // Get video file path
    const videoPath = path.join(__dirname, 'sample.mp4');
    const videoExists = fs.existsSync(videoPath);
    
    if (!videoExists) {
      console.warn('⚠️ Video file sample.mp4 not found. Notifications will be sent without video.');
    } else {
      console.log('✅ Video file found, will be included in notifications');
    }

    // Send both emails and WhatsApp messages
    const notificationPromises = winners.map(async (winner) => {
      const winnerData = {
        name: winner.name? winner.name.trim() : 'Winner',
        email: winner.email,
        phone: winner.phone_number,
        city: winner.city,
        code: winner.code
      };

      const results = {
        name: winnerData.name,
        phone: winnerData.phone,
        email: winnerData.email,
        emailStatus: 'skipped',
        whatsappStatus: 'skipped',
        videoSent: false,
        errors: []
      };

      // Send WhatsApp message if phone number exists (text only for winners)
      if (winnerData.phone) {
        try {
          const whatsappMessage = `🎉 *CONGRATULATIONS ${winnerData.name}!* 🎉

            🏆 You're a WINNER in the Maidan 72 Club contest!

            ✅ *Your Winner Details:*
            👤 Name: ${winnerData.name}
            🎫 Winning Code: *${winnerData.code}*
            🏙️ City: ${winnerData.city}

            🎯 *What's Next?*
            Please contact us as soon as possible to claim your prize. Keep your winning code safe as you'll need it for verification.

            Thank you for participating in Maidan 72 Club! 🏏

            *Best regards,*
            Maidan 72 Club Team`;

          await sendText(winnerData.phone, whatsappMessage);
          results.whatsappStatus = 'sent';
          results.videoSent = false; // No video sent for winners
          console.log(`📱 WhatsApp winner notification sent to ${winnerData.name} (${winnerData.phone})`);
        } catch (error) {
          results.whatsappStatus = 'failed';
          results.errors.push(`WhatsApp: ${error.message}`);
          console.error(`❌ Failed to send WhatsApp to ${winnerData.phone}:`, error.message);
        }
      }

      // Send email if email exists
      if (winnerData.email) {
        const mailOptions = {
          from: 'aditya.as@somaiya.edu',
          to: winnerData.email,
          subject: '🎉 Congratulations! You\'re a Winner - Maidan 72 Club',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h1 style="color: #2563eb; text-align: center; margin-bottom: 30px;">🎉 Congratulations ${winnerData.name}!</h1>
                
                <p style="font-size: 18px; color: #333; line-height: 1.6;">
                  We are thrilled to inform you that you've been selected as a <strong>winner</strong> in the Maidan 72 Club contest!
                </p>
                
                <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                  <h3 style="color: #1e40af; margin-top: 0;">Your Winner Details:</h3>
                  <p style="margin: 5px 0;"><strong>Name:</strong> ${winnerData.name}</p>
                  <p style="margin: 5px 0;"><strong>Winning Code:</strong> <span style="background-color: #dbeafe; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold;">${winnerData.code}</span></p>
                  <p style="margin: 5px 0;"><strong>Registration City:</strong> ${winnerData.city}</p>
                </div>
                
                ${videoExists ? `
                <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                  <h3 style="color: #92400e; margin-top: 0;">🎬 Special Winner Video!</h3>
                  <p style="margin: 5px 0; color: #92400e;">We've attached a special congratulations video just for you! Please download and watch it to get important information about your prize.</p>
                </div>
                ` : ''}
                
                <p style="color: #333; line-height: 1.6;">
                  Please contact us as soon as possible to claim your prize. Make sure to keep your winning code safe as you'll need it for verification.
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <p style="font-size: 16px; color: #666;">Thank you for participating in Maidan 72 Club!</p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <div style="text-align: center; color: #666; font-size: 14px;">
                  <p><strong>Best regards,</strong><br>Maidan 72 Club Team</p>
                  <p style="margin-top: 20px; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `
        };

        // Add video attachment if it exists
        if (videoExists) {
          mailOptions.attachments = [
            {
              filename: 'congratulations-video.mp4',
              path: videoPath,
              contentType: 'video/mp4'
            }
          ];
        }

        try {
          await transporter.sendMail(mailOptions);
          results.emailStatus = 'sent';
          console.log(`📧 Email sent successfully to ${winnerData.name} (${winnerData.email})`);
        } catch (error) {
          results.emailStatus = 'failed';
          results.errors.push(`Email: ${error.message}`);
          console.error(`❌ Failed to send email to ${winnerData.email}:`, error.message);
        }
      }

      return results;
    });

    const notificationResults = await Promise.all(notificationPromises);
    
    // Count successful and failed notifications
    const emailsSent = notificationResults.filter(result => result.emailStatus === 'sent').length;
    const emailsFailed = notificationResults.filter(result => result.emailStatus === 'failed').length;
    const whatsappSent = notificationResults.filter(result => result.whatsappStatus === 'sent').length;
    const whatsappFailed = notificationResults.filter(result => result.whatsappStatus === 'failed').length;
    const videosSent = notificationResults.filter(result => result.videoSent === true).length;
    
    // Create summary message
    const emailMessage = emailsSent > 0 ? `${emailsSent} email(s) sent` : '';
    const whatsappMessage = whatsappSent > 0 ? `${whatsappSent} WhatsApp message(s) sent` : '';
    const videoMessage = videosSent > 0 ? `${videosSent} video notification(s) sent` : '';
    const successMessages = [emailMessage, whatsappMessage, videoMessage].filter(Boolean);
    
    const failureMessage = [];
    if (emailsFailed > 0) failureMessage.push(`${emailsFailed} email(s) failed`);
    if (whatsappFailed > 0) failureMessage.push(`${whatsappFailed} WhatsApp message(s) failed`);
    
    let message = 'Congratulations notifications sent successfully!';
    if (successMessages.length > 0) {
      message = `${successMessages.join(', ')} successfully!`;
    }
    if (failureMessage.length > 0) {
      message += ` ${failureMessage.join(' and ')}.`;
    }
    
    if (videoExists) {
      message += ` Video attachments included.`;
    }
    
    res.json({
      success: true,
      totalWinners: winners.length,
      emailsSent,
      emailsFailed,
      whatsappSent,
      whatsappFailed,
      videosSent,
      videoIncluded: videoExists,
      results: notificationResults,
      message
    });

  } catch (error) {
    console.error("Error sending winner notifications:", error);
    res.status(500).json({ error: "Failed to send winner notifications" });
  }
});

app.get("/webhook", (req, res) => {
  try {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    
    if (!mode || !token || !challenge) {
      console.error('Missing webhook verification parameters');
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      console.error('Webhook verification failed:', { mode, token: token ? '[PRESENT]' : '[MISSING]' });
      res.status(403).json({ error: 'Webhook verification failed' });
    }
  } catch (error) {
    console.error('Error in webhook verification:', error.message);
    res.status(500).json({ error: 'Internal server error during webhook verification' });
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    
    if (!body) {
      console.error('Empty webhook body received');
      return res.status(400).json({ error: 'Empty request body' });
    }
    
    // console.log("Incoming webhook:", JSON.stringify(body, null, 2));

    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) {
      console.log('No message found in webhook body');
      return res.sendStatus(200);
    }

    const from = msg.from;
    const text = (msg.text?.body || "").trim();
    const buttonReply = msg.interactive?.button_reply?.id;
    const templateButtonReply = msg.interactive?.button_reply?.title;
    
    // Debug: Log the message structure to understand template responses
    console.log('📩 Message received:', {
      from,
      text,
      buttonReply,
      templateButtonReply,
      messageType: msg.type,
      interactive: msg.interactive,
      isButtonClick: msg.type === "button"
    });
    
    if (!from) {
      console.error('No sender phone number found in message');
      return res.sendStatus(200);
    }
    
    const sessionKey = `session:${from}`;

    let session;
    try {
      session = await redisClient.hGetAll(sessionKey);
    } catch (redisError) {
      console.error('Redis error while getting session:', redisError.message);
      await sendText(from, "⚠️ Technical issue occurred. Please try again later.");
      return res.sendStatus(200);
    }

    // Handle button click from template (messageType: 'button') or text message "Join Contest"
    if (msg.type === "button" || text.toLowerCase() === "join contest" || text === "Join Contest") {
      console.log(`🔘 Join Contest button/text detected from ${from}, messageType: ${msg.type}`);
      try {
        // Check if user has already registered
        const existingUserResult = await pool.query(
          "SELECT * FROM codes WHERE phone_number = $1 AND status = 'inactive'",
          [from]
        );

        if (existingUserResult.rows.length > 0) {
          // User has already registered
          const userData = existingUserResult.rows[0];
          const userName = userData["name"] ? userData["name"].trim() : "User";
          console.log("userData",userData);
          
          await sendText(from, `👋 Hello ${userName}!

🎉 You have already registered for the Maidan 72 contest with this phone number.

✅ Your registration details:
👤 Name: ${userName}
📧 Email: ${userData.email || 'N/A'}
🏙️ City: ${userData.city || 'N/A'}
🎫 Code: ${userData.code || 'N/A'}

❌ Multiple registrations from the same phone number are not allowed.

If you want to register with a different account, please use a different phone number.

Thank you for your participation! 🏏`);
          
          return res.sendStatus(200);
        }

        // User hasn't registered, start with scratch code verification
        await sendText(from, `🎯 Great! Let's get you registered for Maidan 72!

To begin your registration, please enter your 6-character scratch code from your Rexona product:`);
        
        await redisClient.hSet(sessionKey, { step: "ASK_CODE", phone: from });
        await redisClient.expire(sessionKey, 30 * 60); // 30 min timeout
        return res.sendStatus(200);
      } catch (error) {
        console.error('Error handling join contest text:', error.message);
        try {
          await sendText(from, "⚠️ There was a technical issue. Please try again later.");
        } catch (fallbackError) {
          console.error('Failed to send join contest error message:', fallbackError.message);
        }
      }
    }

    // Handle initial welcome message
    if (!session.step && !session.template_sent) {
      try {
        // Check if user has already registered
        const existingUserResult = await pool.query(
          "SELECT * FROM codes WHERE phone_number = $1 AND status = 'inactive'",
          [from]
        );

        if (existingUserResult.rows.length > 0) {
          // User has already registered
          const userData = existingUserResult.rows[0];
          const userName = userData["name"] ? userData["name"].trim() : "User";
          console.log("userData",userData);
          
          await sendText(from, `👋 Hello ${userName}!

🎉 You have already registered for the Maidan 72 contest with this phone number.

✅ Your registration details:
👤 Name: ${userName}
📧 Email: ${userData.email || 'N/A'}
🏙️ City: ${userData.city || 'N/A'}
🎫 Code: ${userData.code || 'N/A'}

❌ Multiple registrations from the same phone number are not allowed.

If you want to register with a different account, please use a different phone number.

Thank you for your participation! 🏏`);
          
          return res.sendStatus(200);
        }

        // User hasn't registered, send WhatsApp Business template
        await sendWhatsAppTemplate(from, "join_contest");
        
        // Mark template as sent and wait for button click
        await redisClient.hSet(sessionKey, { 
          phone: from, 
          template_sent: "true" 
        });
        await redisClient.expire(sessionKey, 30 * 60); // 30 min timeout
      } catch (error) {
        console.error('Error in welcome message flow:', error.message);
        try {
          await sendText(from, "⚠️ Welcome! There was a technical issue. Please try again later.");
        } catch (fallbackError) {
          console.error('Failed to send fallback message:', fallbackError.message);
        }
      }
    } else if (!session.step && session.template_sent) {
      // Template already sent, user is sending another message
      // Check if it's not the "Join Contest" button click or text response
      if (msg.type !== "button" && text.toLowerCase() !== "join contest" && text !== "Join Contest") {
        await sendText(from, "👋 Hi! I've already sent you the contest information. Please click the 'Join Contest' button in the message above to proceed with registration.");
      }
    } else if (session.step === "ASK_NAME") {
      try {
        const validation = await validateWithOpenAI(text, "ASK_NAME", session);
        await sendText(from, validation.message);
        
        if (validation.is_valid) {
          await redisClient.hSet(sessionKey, { step: "ASK_EMAIL", name: validation.value });
        }
      } catch (error) {
        console.error('Error in ASK_namestep:', error.message);
        try {
          await sendText(from, "⚠️ Sorry, there was an issue processing your name. Please try entering your full nameagain:");
        } catch (fallbackError) {
          console.error('Failed to send nameerror message:', fallbackError.message);
        }
      }
    } else if (session.step === "ASK_EMAIL") {
      try {
        const validation = await validateWithOpenAI(text, "ASK_EMAIL", session);
        
        if (!validation.is_valid) {
          await sendText(from, validation.message);
          return res.sendStatus(200);
        }

        try {
          // Check if email is already registered in the database
          const emailCheck = await pool.query(
            "SELECT * FROM codes WHERE email = $1",
            [validation.value]
          );

          if (emailCheck.rows.length > 0) {
            await sendText(from, "❌ This email is already registered with us. Please provide a different email address:");
          } else {
            await sendText(from, validation.message);
            await redisClient.hSet(sessionKey, { step: "ASK_CITY", email: validation.value });
          }
        } catch (dbError) {
          console.error("Database error during email check:", dbError.message);
          await sendText(from, "⚠️ Something went wrong while checking your email. Please try again later.");
        }
      } catch (error) {
        console.error('Error in ASK_EMAIL step:', error.message);
        try {
          await sendText(from, "⚠️ Sorry, there was an issue processing your email. Please try entering your email address again:");
        } catch (fallbackError) {
          console.error('Failed to send email error message:', fallbackError.message);
        }
      }
    } else if (session.step === "ASK_CITY") {
      try {
        const validation = await validateWithOpenAI(text, "ASK_CITY", session);
        
        if (!validation.is_valid) {
          await sendText(from, validation.message);
          return res.sendStatus(200);
        }

        // Store city and move to final registration
        await redisClient.hSet(sessionKey, { 
          step: "FINAL_REGISTRATION", 
          city: validation.value 
        });

        // Send confirmation message and complete registration
//         await sendText(from, `✅ Perfect! Let me complete your registration...

// 📝 *Your Details:*
// 👤 Name: ${session.name}
// 📧 Email: ${session.email}
// 🏙️ City: ${validation.value}
// 🎫 Code: ${session.code}

// Processing your registration... 🔄`);

        // Trigger the final registration step
        // We'll simulate receiving another message to trigger FINAL_REGISTRATION
        setTimeout(async () => {
          try {
            const updateSuccess = await updateCodeInDatabase({ 
              phone: session.phone || from, 
              name: session.name,
              email: session.email, 
              city: validation.value, 
              code: session.code 
            });
            
            if (updateSuccess) {
              await redisClient.del(sessionKey);
              
              // Send congratulations video after successful registration
              const videoPath = path.join(__dirname, 'sample.mp4');
              const videoExists = fs.existsSync(videoPath);
              
              if (videoExists) {
                try {
                  const videoCaption = `🎉 *CONGRATULATIONS!* 🎉

✅ Your registration for Maidan 72 Club is now complete!

📝 *Your Registration Details:*
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${validation.value}
🎫 Code: ${session.code}

🏆 You're now part of the contest! Winners will be announced soon.

Thank you for participating in Maidan 72 Club! 🏏

*Best regards,*
Maidan 72 Club Team`;

                  await sendVideoMessage(from, videoPath, videoCaption);
                  console.log(`📱🎥 Registration video sent to ${from}`);
                } catch (videoError) {
                  console.error(`❌ Failed to send registration video, sending text instead:`, videoError.message);
                  // Fallback to text message if video fails
                  await sendText(from, `🎉 Congratulations! Your registration is complete. 

📝 Your Registration Details:
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${validation.value}
🎫 Code: ${session.code}

Your details have been saved and the scratch code has been marked as used. You're now part of the contest! 🏏`);
                }
              } else {
                // Send text message if video doesn't exist
                await sendText(from, `🎉 Congratulations! Your registration is complete. 

📝 Your Registration Details:
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${validation.value}
🎫 Code: ${session.code}

Your details have been saved and the scratch code has been marked as used. You're now part of the contest! 🏏`);
              }
            } else {
              await sendText(from, "⚠️ Registration failed. Please try again or contact support.");
            }
          } catch (updateError) {
            console.error("Error during final registration:", updateError.message);
            await sendText(from, "⚠️ Registration encountered an issue. Please contact support with your code: " + session.code);
          }
        }, 1000); // 1 second delay to show processing message
        
      } catch (error) {
        console.error('Error in ASK_CITY step:', error.message);
        try {
          await sendText(from, "⚠️ Sorry, there was an issue processing your city. Please try entering your city name again:");
        } catch (fallbackError) {
          console.error('Failed to send city error message:', fallbackError.message);
        }
      }
    } else if (session.step === "ASK_CODE") {
      try {
        // First validate code format with OpenAI
        const validation = await validateWithOpenAI(text, "ASK_CODE", session);
        
        if (!validation.is_valid) {
          await sendText(from, validation.message);
          return res.sendStatus(200);
        }

        try {
          // Check if the code exists in active codes
          const result = await pool.query(
            "SELECT * FROM codes WHERE status = 'active' AND code = $1",
            [validation.value]
          );

          if (result.rows.length > 0) {
            // ✅ Code found in database - proceed to collect user details
            await sendText(from, `✅ Great! Your scratch code is valid.

Now, please enter your full name:`);
            
            // Store the validated code in session and move to next step
            await redisClient.hSet(sessionKey, { 
              step: "ASK_NAME", 
              code: validation.value 
            });
          } else {
            // ❌ Code not found in database
            await sendText(from, "❌ Invalid scratch code. This code is not found in our system or has already been used. Please provide a valid scratch code:");
          }
        } catch (dbError) {
          console.error("Database error during code validation:", dbError.message);
          await sendText(from, "⚠️ Something went wrong while checking your scratch code. Please try again later.");
        }
      } catch (error) {
        console.error('Error in ASK_CODE step:', error.message);
        try {
          await sendText(from, "⚠️ Sorry, there was an issue processing your code. Please try entering your scratch code again:");
        } catch (fallbackError) {
          console.error('Failed to send code error message:', fallbackError.message);
        }
      }
    } else if (session.step === "FINAL_REGISTRATION") {
      try {
        // This is the final step - complete registration
        const updateSuccess = await updateCodeInDatabase({ 
          phone: session.phone || from, 
          name: session.name,
          email: session.email, 
          city: session.city, 
          code: session.code 
        });
        
        if (updateSuccess) {
          await redisClient.del(sessionKey);
          
          // Send congratulations video after successful registration
          const videoPath = path.join(__dirname, 'sample.mp4');
          const videoExists = fs.existsSync(videoPath);
          
          if (videoExists) {
            try {
              const videoCaption = `🎉 *CONGRATULATIONS!* 🎉

✅ Your registration for Maidan 72 Club is now complete!

📝 *Your Registration Details:*
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${session.city}
🎫 Code: ${session.code}

🏆 You're now part of the contest! Winners will be announced soon.

Thank you for participating in Maidan 72 Club! 🏏

*Best regards,*
Maidan 72 Club Team`;

              await sendVideoMessage(from, videoPath, videoCaption);
              console.log(`📱🎥 Registration video sent to ${from}`);
            } catch (videoError) {
              console.error(`❌ Failed to send registration video, sending text instead:`, videoError.message);
              // Fallback to text message if video fails
              await sendText(from, `🎉 Congratulations! Your registration is complete. 

📝 Your Registration Details:
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${session.city}
🎫 Code: ${session.code}

Your details have been saved and the scratch code has been marked as used. You're now part of the contest! 🏏`);
            }
          } else {
            // Send text message if video doesn't exist
            await sendText(from, `🎉 Congratulations! Your registration is complete. 

📝 Your Registration Details:
👤 Name: ${session.name}
📧 Email: ${session.email}
🏙️ City: ${session.city}
🎫 Code: ${session.code}

Your details have been saved and the scratch code has been marked as used. You're now part of the contest! 🏏`);
          }
        } else {
          await sendText(from, "⚠️ Registration failed. Please try again or contact support.");
        }
      } catch (updateError) {
        console.error("Error during final registration:", updateError.message);
        await sendText(from, "⚠️ Registration encountered an issue. Please contact support with your code: " + session.code);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Critical error in webhook POST handler:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Global error handler middleware (must be last)
app.use((error, req, res, next) => {
  console.error('Unhandled application error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });
  
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process immediately, give it a chance to clean up
  setTimeout(() => {
    console.error('Forcing exit due to uncaught exception');
    process.exit(1);
  }, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

app.get("/",(req,res)=> {
  res.send("Hello World");
})

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log("📋 Available endpoints:");
  console.log("  - GET /webhook: Webhook verification");
  console.log("  - POST /webhook: Conversation flow handler");
  console.log("  - GET /api/stats: Statistics data");
  console.log("  - GET /api/charts: Chart data");
  console.log("  - GET /api/recent-activity: Recent activity data");
  console.log("  - POST /api/update-winners: Update winners");
  console.log("  - POST /api/send-winner-emails: Send winner notifications");
  console.log("  - DELETE /api/registration/:phone: Delete registration by phone number");
  console.log("✅ Server started successfully with comprehensive error handling");
}).on('error', (error) => {
  console.error('❌ Server failed to start:', error.message);
  process.exit(1);
});
