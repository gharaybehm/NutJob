# Skill: Deploy Application Locally

**Goal:** Start the NutJob application on the local development machine.

**Steps:**
1. Open a terminal in the project root directory.
2. Ensure you have all required dependencies installed by running `npm install`.
3. Verify that environment variables are set (you can copy `.env.local.example` to `.env.local` if it's missing).
4. Run the Next.js development server using the command: 
   ```bash
   npm run dev
   ```
5. Wait for the server to start (it will use Turbopack and compile the Next.js app).
6. Access the application via `http://localhost:3000`.

**Testing Production Build:** 
If you need to test the production build locally instead of the development server, run:
```bash
npm run build
npm run start
```
