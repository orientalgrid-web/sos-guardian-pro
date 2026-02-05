from PIL import Image, ImageDraw, ImageFont
import os

# Create icons directory
os.makedirs('icons', exist_ok=True)
os.makedirs('screenshots', exist_ok=True)

# Create a simple blue shield icon
def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), color=(10, 25, 47, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw shield
    margin = size // 8
    draw.ellipse([margin, margin, size-margin, size-margin], 
                 fill=(0, 102, 255, 255))  # Blue
    
    # Draw inner circle
    inner_margin = size // 4
    draw.ellipse([inner_margin, inner_margin, size-inner_margin, size-inner_margin], 
                 fill=(255, 255, 255, 255))  # White
    
    # Add SR text for larger icons
    if size >= 72:
        try:
            font = ImageFont.load_default()
            # Scale font size
            font_size = size // 4
            draw.text((size//2, size//2), "SR", 
                     fill=(0, 102, 255, 255),  # Blue text
                     font=ImageFont.truetype("arial.ttf", font_size) if os.name == 'nt' else font,
                     anchor="mm")
        except:
            pass
    
    img.save(f'icons/{filename}')
    print(f"Created: icons/{filename}")

# Create all required icons
sizes = [
    (16, 'icon-16x16.png'),
    (32, 'icon-32x32.png'),
    (72, 'icon-72x72.png'),
    (96, 'icon-96x96.png'),
    (144, 'icon-144x144.png'),
    (152, 'icon-152x152.png'),
    (180, 'icon-180x180.png'),
    (192, 'icon-192x192.png'),
    (310, 'icon-310x310.png'),
    (512, 'icon-512x512.png'),
]

for size, filename in sizes:
    create_icon(size, filename)

# Create shortcut icons
def create_shortcut_icon(size, filename, color, text):
    img = Image.new('RGBA', (size, size), color=(10, 25, 47, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw circle
    draw.ellipse([0, 0, size, size], fill=color)
    
    # Add text
    try:
        font_size = size // 2
        draw.text((size//2, size//2), text, 
                 fill=(255, 255, 255, 255),
                 font=ImageFont.truetype("arial.ttf", font_size) if os.name == 'nt' else ImageFont.load_default(),
                 anchor="mm")
    except:
        pass
    
    img.save(f'icons/{filename}')
    print(f"Created: icons/{filename}")

# Create shortcut icons
create_shortcut_icon(96, 'emergency-96.png', (255, 51, 102, 255), '!')  # Red emergency
create_shortcut_icon(96, 'tracking-96.png', (0, 102, 255, 255), '📍')   # Blue tracking
create_shortcut_icon(96, 'contacts-96.png', (0, 204, 136, 255), '👥')   # Green contacts

# Create simple screenshots
for name, size in [('wide.png', (1280, 720)), ('narrow.png', (720, 1280))]:
    img = Image.new('RGB', size, color=(10, 25, 47))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, size[0]-50, size[1]-50], outline=(0, 102, 255), width=5)
    draw.text((size[0]//2, size[1]//2), f"SafeRoute\n{size[0]}x{size[1]}", 
              fill=(255,255,255), anchor="mm", align="center")
    img.save(f'screenshots/{name}')
    print(f"Created: screenshots/{name}")

print("\n✅ All files created successfully!")
print("\nTo use:")
print("1. Install Pillow: pip install Pillow")
print("2. Run: python create_icons.py")
