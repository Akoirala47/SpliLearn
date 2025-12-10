# SplitLearn

SplitLearn is a modern educational platform designed to enhance the learning experience. Built with React, Vite, and Tailwind CSS, it features a comprehensive dashboard, class management, exam tracking, and a unique split-screen interface for simultaneous video watching and note-taking.

## Project Structure

The main web application is located in the `splitlearn-web` directory.

## Environment Variables

To run this project, you will need to add the following environment variables.

### Frontend (`splitlearn-web/.env`)

-   `VITE_SUPABASE_URL`: Your Supabase project URL.
-   `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous API key.

### Backend (Supabase Edge Functions)

These should be set in your Supabase project dashboard or via the CLI.

-   `GEMINI_API_KEY`: API key for Google Gemini.
    -   **How to get it**: Get a free API key from [Google AI Studio](https://aistudio.google.com/).
-   `YOUTUBE_API_KEY`: API key for YouTube Data API v3.
    -   **How to get it**: Create a project and enable the YouTube Data API v3 in the [Google Cloud Console](https://console.cloud.google.com/).

## Getting Started

To set up and run the project locally, follow these steps:

1.  **Navigate to the web application directory:**
    ```bash
    cd splitlearn-web
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:5173` (or the port shown in your terminal).
