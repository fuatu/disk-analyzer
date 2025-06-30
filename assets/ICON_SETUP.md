# Icon Setup Guide

To change the app icon for DiskAnalyzer, you need to create icon files for different platforms and place them in the `assets/icons/` directory.

## Required Icon Files

### For macOS (.icns file)
- **File**: `assets/icons/icon.icns`
- **Sizes**: 512x512, 256x256, 128x128, 64x64, 32x32, 16x16
- **Format**: ICNS (Apple Icon Image format)

### For Windows (.ico file)
- **File**: `assets/icons/icon.ico`
- **Sizes**: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
- **Format**: ICO (Windows Icon format)

### For Linux (.png file)
- **File**: `assets/icons/icon.png`
- **Size**: 512x512 (recommended)
- **Format**: PNG

## How to Create Icon Files

### Option 1: Online Icon Converters
1. Create a high-resolution PNG image (1024x1024 recommended)
2. Use online converters like:
   - [CloudConvert](https://cloudconvert.com/) - Convert PNG to ICNS/ICO
   - [ICO Convert](https://icoconvert.com/) - Convert to ICO
   - [ICNS Converter](https://iconverticons.com/online/) - Convert to ICNS

### Option 2: Using macOS (for .icns)
```bash
# Create iconset directory
mkdir icon.iconset

# Add your PNG files with specific names:
# icon_16x16.png, icon_32x32.png, icon_64x64.png, icon_128x128.png, 
# icon_256x256.png, icon_512x512.png
# Also add @2x versions for retina displays

# Convert to .icns
iconutil -c icns icon.iconset
```

### Option 3: Using ImageMagick
```bash
# Install ImageMagick first
# For ICO file:
convert icon.png -resize 256x256 -colors 256 icon.ico

# For different sizes in ICO:
convert icon.png \( -clone 0 -resize 16x16 \) \( -clone 0 -resize 32x32 \) \( -clone 0 -resize 48x48 \) \( -clone 0 -resize 64x64 \) \( -clone 0 -resize 128x128 \) \( -clone 0 -resize 256x256 \) -delete 0 icon.ico
```

## Design Recommendations

- **Style**: Use a simple, recognizable design that works at small sizes
- **Colors**: Use colors that contrast well with both light and dark backgrounds
- **Content**: Consider using a disk/storage related icon (💾, 📊, 🗂️)
- **Background**: Transparent background for better integration
- **Consistency**: Keep the design consistent across all sizes

## Example Icon Ideas for DiskAnalyzer

1. **Disk with Chart**: Combine a disk icon with a pie chart or bar graph
2. **Folder with Magnifying Glass**: Represents analyzing folder contents
3. **Storage Device**: Hard drive, SSD, or generic storage icon
4. **Analytics Symbol**: Graph or chart with storage elements

## After Adding Icons

1. Place your icon files in `assets/icons/`
2. Rebuild the application: `npm run build`
3. For development: `npm start`
4. For distribution: `npm run dist`

The icons will be automatically used for:
- Window title bar icon
- Taskbar/dock icon
- Application bundle icon (when built)
- Desktop shortcut icon