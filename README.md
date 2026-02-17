# smart-translate

This project is a React application built with Vite, designed to provide smart translation features effectively.

## Features

- **Smart Translation**: leverages AI for context-aware translations.
- **Modern Tech Stack**: React, Vite, TypeScript, and Tailwind CSS (if applicable).
- **Automated Deployment**: GitHub Actions workflow for seamless deployment to GitHub Pages.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YUSEN711/smart-translate.git
   cd smart-translate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Create a `.env.local` file in the root directory.
   - Add your API keys and configuration:
     ```env
     VITE_GEMINI_API_KEY=your_api_key_here
     ```

### Development

To start the development server:

```bash
npm run dev
```

Open [http://localhost:3000/smart-translate/](http://localhost:3000/smart-translate/) (or the URL shown in your terminal) to view the app.

### Building for Production

To build the application for production:

```bash
npm run build
```

The build artifacts will be stored in the `dist` directory.

### Deployment

This project is configured to automatically deploy to GitHub Pages using GitHub Actions.

1. **Push changes to `main` branch:**
   Any push to the `main` branch will trigger the deployment workflow.

2. **Manual Deployment (Optional):**
   You can also manually deploy by running the workflow from the Actions tab in your repository.

3. **GitHub Pages Settings:**
   Ensure your repository's Pages settings are configured to serve from the `gh-pages` branch.

## Project Structure

- `src/`: Source code
- `public/`: Static assets
- `.github/workflows/`: GitHub Actions workflows
- `vite.config.ts`: Vite configuration

## License

[MIT](LICENSE)
