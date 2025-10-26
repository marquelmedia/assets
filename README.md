# Assets Directory

This directory contains shared assets used across the MARQUELMEDIA platform, including images, icons, and configuration files.

## 📁 Structure

```
assets/
├── ci/                    # CI/CD configuration
│   └── env.ts             # Environment configuration
├── img/                    # Image assets
│   ├── devices/           # Device-specific images
│   ├── stores/            # App store images
│   └── *.svg, *.png       # Various image files
├── type/                  # Type definitions
│   └── emojis.json        # Emoji definitions
├── package.json           # Dependencies and scripts
└── yarn.lock              # Dependency lock file
```

## 🎨 Image Assets

### Logo and Branding
- **logo.svg** - Main MARQUELMEDIA logo
- **logo.png** - PNG version of main logo
- **logo-alt.svg** - Alternative logo version
- **mark.svg** - Logo mark/icon
- **icon.svg** - General icon

### Device Images
- **devices/iphone.png** - iPhone device mockup
- **stores/app-store.png** - Apple App Store badge
- **stores/play-store.png** - Google Play Store badge

### UI Elements
- **glass.png** - Glass effect overlay
- **pixel.png** - Pixel pattern
- **rotate.png** - Rotation indicator
- **ash.gif** - Loading animation
- **no.svg** - No/error icon

## 🔧 Configuration

### CI/CD Configuration
- **ci/env.ts** - Environment configuration for CI/CD pipelines

### Type Definitions
- **type/emojis.json** - Emoji definitions and mappings

## 📦 Dependencies

### Package Management
- **package.json** - Node.js dependencies and scripts
- **yarn.lock** - Dependency lock file for consistent installs
- **bun.lockb** - Bun lock file for fast package management

## 🚀 Usage

### For Developers
- **Image Assets**: Reference images using relative paths from project root
- **Configuration**: Use CI configuration for automated builds
- **Types**: Import emoji definitions for consistent emoji usage

### For Build Tools
- **Asset Processing**: Images are processed during build
- **Optimization**: Assets are optimized for production
- **CDN Integration**: Assets can be served from CDN

## 📚 Related Documentation

- **[Frontend Documentation](../docs/frontend/)** - Frontend asset usage
- **[Marketing Documentation](../docs/frontend/)** - Marketing site assets
- **[Build Tools Documentation](../docs/tools/)** - Asset processing tools
- **[Deployment Documentation](../docs/deployment/)** - Production asset deployment
