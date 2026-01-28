/**
 * Control Icons Service
 * 
 * Manages the dynamic control icon system - interactive SVG icons
 * that can be assigned to devices for multi-command controls.
 */

const fs = require('fs');
const path = require('path');

let CONTROL_ICONS_DIR = null;

/**
 * Set the control icons directory and ensure it exists on disk.
 * Creates the directory recursively if it does not already exist.
 * @param {string} dir - Filesystem path to the control-icons directory.
 */
function init(dir) {
    CONTROL_ICONS_DIR = dir;
    // Ensure directory exists
    if (!fs.existsSync(CONTROL_ICONS_DIR)) {
        fs.mkdirSync(CONTROL_ICONS_DIR, { recursive: true });
    }
}

/**
 * Retrieve all available control icons along with their parsed manifests.
 *
 * If the service has not been initialized, returns an empty array.
 *
 * @returns {Object[]} Array of icon definition objects. Each object contains the manifest's fields, a `manifestFile` string, and `svgUrl` which is a URL string for the SVG asset or `null` for React-only components.
 */
function getControlIcons() {
    if (!CONTROL_ICONS_DIR) {
        console.warn('[controlIcons] Service not initialized');
        return [];
    }

    const icons = [];
    
    try {
        const files = fs.readdirSync(CONTROL_ICONS_DIR);
        
        // Find all manifest files
        const manifestFiles = files.filter(f => f.endsWith('.manifest.json'));
        
        for (const manifestFile of manifestFiles) {
            try {
                const manifestPath = path.join(CONTROL_ICONS_DIR, manifestFile);
                const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                const manifest = JSON.parse(manifestContent);
                
                // React-only components don't need an SVG file
                if (manifest.reactComponent && !manifest.file) {
                    icons.push({
                        ...manifest,
                        manifestFile,
                        svgUrl: null, // No SVG for React-only components
                    });
                } else if (manifest.file) {
                    // Verify the SVG file exists
                    const svgPath = path.join(CONTROL_ICONS_DIR, manifest.file);
                    if (fs.existsSync(svgPath)) {
                        icons.push({
                            ...manifest,
                            manifestFile,
                            svgUrl: `/control-icons/${manifest.file}`,
                        });
                    } else {
                        console.warn(`[controlIcons] SVG file not found for manifest: ${manifestFile}`);
                    }
                } else {
                    console.warn(`[controlIcons] Manifest missing 'file' or 'reactComponent': ${manifestFile}`);
                }
            } catch (err) {
                console.error(`[controlIcons] Failed to parse manifest: ${manifestFile}`, err.message);
            }
        }
    } catch (err) {
        console.error('[controlIcons] Failed to read control icons directory:', err.message);
    }
    
    return icons;
}

/**
 * Get a specific control icon by ID.
 * @param {string} id - The control icon ID
 * @returns {Object|null} The control icon definition or null if not found
 */
function getControlIconById(id) {
    const icons = getControlIcons();
    return icons.find(icon => icon.id === id) || null;
}

/**
 * Get control icons that are compatible with a device's commands.
 * @param {string[]} deviceCommands - Array of command names the device supports
 * @returns {Object[]} Array of compatible control icon definitions
 */
function getCompatibleControlIcons(deviceCommands) {
    const icons = getControlIcons();
    const commandSet = new Set(deviceCommands);
    
    return icons.filter(icon => {
        // Check if all required commands are available
        const requiredCommands = icon.requiredCommands || [];
        return requiredCommands.every(cmd => commandSet.has(cmd));
    });
}

/**
 * Read the SVG content for a control icon.
 * @param {string} id - The control icon ID
 * @returns {string|null} The SVG content or null if not found
 */
function getControlIconSvg(id) {
    if (!CONTROL_ICONS_DIR) return null;
    
    const icon = getControlIconById(id);
    if (!icon) return null;
    
    // React-only components don't have SVG files
    if (!icon.file) return null;
    
    try {
        const svgPath = path.join(CONTROL_ICONS_DIR, icon.file);
        return fs.readFileSync(svgPath, 'utf8');
    } catch (err) {
        console.error(`[controlIcons] Failed to read SVG for: ${id}`, err.message);
        return null;
    }
}

/**
 * Validate a control icon manifest against the expected schema.
 * @param {Object} manifest - The manifest object to validate (expected fields: `id`, `name`, `file`, `requiredCommands`, `regions`).
 * @returns {{ valid: boolean, errors: string[] }} `valid` is `true` if the manifest satisfies schema requirements; `errors` contains human-readable validation failure messages.
 */
function validateManifest(manifest) {
    const errors = [];
    
    if (!manifest.id || typeof manifest.id !== 'string') {
        errors.push('Missing or invalid "id" field');
    }
    
    if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('Missing or invalid "name" field');
    }
    
    if (!manifest.file || typeof manifest.file !== 'string') {
        errors.push('Missing or invalid "file" field');
    }
    
    if (!Array.isArray(manifest.requiredCommands)) {
        errors.push('Missing or invalid "requiredCommands" array');
    }
    
    if (!Array.isArray(manifest.regions)) {
        errors.push('Missing or invalid "regions" array');
    } else {
        manifest.regions.forEach((region, i) => {
            if (!region.id) errors.push(`Region ${i}: missing "id"`);
            if (!region.selector) errors.push(`Region ${i}: missing "selector"`);
            if (!region.action) errors.push(`Region ${i}: missing "action"`);
            
            const validActions = ['command', 'toggle', 'increment', 'decrement', 'slider'];
            if (region.action && !validActions.includes(region.action)) {
                errors.push(`Region ${i}: invalid action "${region.action}"`);
            }
        });
    }
    
    return { valid: errors.length === 0, errors };
}

module.exports = {
    init,
    getControlIcons,
    getControlIconById,
    getCompatibleControlIcons,
    getControlIconSvg,
    validateManifest,
};