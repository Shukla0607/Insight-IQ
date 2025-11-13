## 🧠 Insight IQ — AI-Powered SQL Analytics

### Insight IQ transforms natural language questions into real SQL queries.
Built with **Gemini API** and **AlaSQL**, it allows users to query datasets conversationally, visualize trends, and analyze data effortlessly.

---

### 🚀 Features
- Natural language to SQL translation  
- Real-time query execution using AlaSQL  
- Cohort retention, repeat purchase, and sales trend analysis  
- Local Gemini API integration via `.env` file  
- Lightweight and developer-friendly with PNPM  

---

### 🛠️ Installation & Setup

### 1️⃣ Extract the ZIP file you downloaded  
### 2️⃣ Open the folder in your IDE or Terminal  
cd Insight-IQ-main

### 3️⃣ Create a .env file and add your Gemini API key  
echo "GEMINI_API_KEY=your_api_key_here" > .env

### 4️⃣ Install pnpm globally (if not already)  
npm i -g pnpm

### 5️⃣ Install all dependencies  
pnpm install

### 6️⃣ Add the required AlaSQL version  
pnpm add alasql@4.9.0

### 7️⃣ Build the client and the server
pnpm build

### 🟢 Start the development server  
pnpm dev

🌐 Once the server starts, open your browser at:  
http://localhost:8080

---

### ✅ Usage Steps
- Select a dataset (e.g., orders, customers, products)  
- Type a question in plain English, e.g.:
  "What is the average order value for electronics?"
- The system will:
  → Generate SQL automatically  
  → Execute the query  
  → Display results and charts  

---

### 📁 Tech Stack
- React + Vite frontend  
- Node.js environment  
- AlaSQL for in-browser SQL computation  
- Gemini API for NL-to-SQL translation  
- PNPM for package management  

---

### 💡 Example Prompts
- "Show me the top 5 cities by order count"  
- "Find average delivery time by category"  
- "Calculate monthly revenue trends"  
- "Compare repeat purchase rates by cohort"  

---

### 🧩 Common Fixes
- If `pnpm dev` fails → ensure all modules are installed  
- If "GEMINI_API_KEY not found" → check your `.env` file  
- If port is busy →  
  pnpm dev --port 5174  

---

### 🧰 Development Notes
- Keep `.env` out of version control (add to `.gitignore`)  
- Use consistent dataset column names for stable SQL parsing  
- AlaSQL 4.9.0 is required for compatibility with Gemini-generated queries  

---

### 🌟 Contributing
### 1. Fork the repo  
### 2. Create your feature branch  
git checkout -b feature-name
### 3. Commit changes  
git commit -m "Add feature"
### 4. Push to branch  
git push origin feature-name
### 5. Open a pull request 🎉  

---

### 🧾 License
This project is open-sourced under the MIT License.

---

### 💬 Made with ❤️ by Saurabh Shukla  
GitHub: https://github.com/Shukla0607/Insight-IQ
