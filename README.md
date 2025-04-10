# Circuit

A modern web application built with Astro, featuring data processing capabilities, SQLite integration, and a beautiful UI powered by Tailwind CSS and DaisyUI.

## 🚀 Features

- **Modern Stack**: Built with Astro, Tailwind CSS, and DaisyUI for a fast and responsive experience
- **Data Processing**: Support for CSV and Excel file processing
- **Database Integration**: SQLite integration for data storage
- **File Upload**: Tus protocol support for reliable file uploads
- **Markdown Support**: Built-in markdown processing capabilities
- **Deployment Ready**: Configured for Netlify deployment

## 📦 Prerequisites

- Node.js (v18 or later recommended)
- npm (v9 or later recommended)

## 🛠️ Installation

1. Clone the repository:

```bash
git clone https://github.com/keshmat/circuit.git
cd circuit
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:4321`

## 🏗️ Project Structure

```
/
├── public/          # Static assets
├── src/
│   ├── components/  # Reusable UI components
│   ├── layouts/     # Page layouts
│   ├── pages/       # Astro pages
│   └── styles/      # Global styles
├── package.json     # Project dependencies and scripts
└── tsconfig.json    # TypeScript configuration
```

## 📋 Available Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start development server         |
| `npm run build`   | Build for production             |
| `npm run preview` | Preview production build locally |
| `npm run astro`   | Run Astro CLI commands           |

## 🔧 Configuration

The project uses several key technologies:

- **Astro**: For building fast, content-focused websites
- **Tailwind CSS**: For utility-first styling
- **DaisyUI**: For beautiful UI components
- **SQLite**: For data storage
- **Supabase**: For backend services
- **Tus**: For reliable file uploads

## 📊 Data Processing

For data processing scripts and utilities, please refer to the `/scripts/` directory. This directory contains:

- Data transformation scripts for `chess-results` cross tables
- CLI for generating reports
- Database generation scripts

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Here's how to contribute:

1. Fork the repository
2. Create a new branch for your feature (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Please ensure your PR:

- Has a clear description of the changes
- Includes tests if applicable
- Follows the existing code style
- Updates documentation if needed
