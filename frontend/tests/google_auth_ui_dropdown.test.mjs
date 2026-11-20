import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buttonPath = path.resolve(__dirname, "../src/components/auth/GoogleSignInButton.tsx");
const headerPath = path.resolve(__dirname, "../src/components/layout/Header.tsx");
const loginPath = path.resolve(__dirname, "../src/pages/auth/Login.tsx");
const registerPath = path.resolve(__dirname, "../src/pages/auth/Register.tsx");
const sidebarPath = path.resolve(__dirname, "../src/components/customer/CustomerSidebar.tsx");
const authCtxPath = path.resolve(__dirname, "../src/context/AuthContext.tsx");
const authSvcPath = path.resolve(__dirname, "../src/services/authService.ts");
const googleIdentityPyPath = path.resolve(__dirname, "../../backend/apps/users/services/google_identity.py");
const viewsPyPath = path.resolve(__dirname, "../../backend/apps/users/views.py");

describe("Issue 5: Google Sign-In UI Flickering, Dropdown Clipping & Account Selection", () => {
  describe("1. GoogleSignInButton Flicker Prevention & Stability", () => {
    const buttonSrc = fs.readFileSync(buttonPath, "utf-8");

    test("Reserves neutral skeleton container while GIS initializes to eliminate button text flicker", () => {
      assert.match(
        buttonSrc,
        /data-testid="google-button-skeleton"/,
        "Must render dedicated skeleton container while GIS initializes"
      );
      const skeletonMatch = buttonSrc.match(/data-testid="google-button-skeleton"[\s\S]*?<\/div>\s*<\/div>/);
      assert.ok(skeletonMatch, "Skeleton container must be present in source");
      assert.doesNotMatch(
        skeletonMatch[0],
        /Continue with Google/,
        "Must NOT show generic text 'Continue with Google' inside loading skeleton"
      );
    });

    test("Enforces unclipped container dimensions with min-h-[44px] and overflow-visible", () => {
      assert.match(
        buttonSrc,
        /min-h-\[44px\][\s\S]*?overflow-visible/,
        "Container must have min-h-[44px] and overflow-visible to prevent clipping personalized button and dropdown"
      );
      assert.match(
        buttonSrc,
        /max-w-\[340px\]\s+h-\[44px\]/,
        "Skeleton and fallback button must match 44px height and max-w-[340px]"
      );
    });

    test("Protects against DOM wipe on parent re-render via renderedRef guard", () => {
      assert.match(
        buttonSrc,
        /const\s+renderedRef\s*=\s*useRef\(false\);/,
        "Must define renderedRef to track button initialization"
      );
      assert.match(
        buttonSrc,
        /if\s*\(renderedRef\.current\s*&&/,
        "Must skip re-rendering Google button if already rendered"
      );
    });

    test("Hides placeholder only after Google iframe is verified in DOM", () => {
      assert.match(
        buttonSrc,
        /pollIframe/,
        "Must poll for rendered iframe before fading out placeholder"
      );
    });

    test("Includes 5000ms SDK load timeout with graceful OAuth redirect fallback", () => {
      assert.match(
        buttonSrc,
        /const\s+timeoutTimer\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?5000\);/,
        "Must include a 5-second load timeout for Google Identity Services"
      );
      assert.match(
        buttonSrc,
        /clearTimeout\(timeoutTimer\)/,
        "Must clean up timeout on script onload or error"
      );
    });

    test("Supports selectAccount prop to force prompt and disable auto-select", () => {
      assert.match(
        buttonSrc,
        /selectAccount\?: boolean;/,
        "Must define selectAccount prop"
      );
      assert.match(
        buttonSrc,
        /if\s*\(selectAccount\s*&&\s*window\.google\.accounts\.id\.disableAutoSelect\)\s*\{\s*window\.google\.accounts\.id\.disableAutoSelect\(\);/,
        "Must disable auto select when selectAccount is true"
      );
      assert.match(
        buttonSrc,
        /return\s+selectAccount\s*\?\s*`\$\{base\}&prompt=select_account`\s*:\s*base;/,
        "Must pass select_account prompt when selectAccount is true"
      );
    });
  });

  describe("2. Login and Register Account Selection Passthrough", () => {
    test("Login page detects select_account query parameter", () => {
      const loginSrc = fs.readFileSync(loginPath, "utf-8");
      assert.match(
        loginSrc,
        /searchParams\.get\("select_account"\)\s*===\s*"1"\s*\|\|\s*searchParams\.get\("switch_account"\)\s*===\s*"1"/,
        "Login.tsx must detect select_account or switch_account query parameter"
      );
      assert.match(
        loginSrc,
        /<GoogleSignInButton[^>]*selectAccount=\{isSelectAccount\}/,
        "Login.tsx must pass selectAccount prop to GoogleSignInButton"
      );
    });

    test("Register page detects select_account query parameter", () => {
      const registerSrc = fs.readFileSync(registerPath, "utf-8");
      assert.match(
        registerSrc,
        /searchParams\.get\("select_account"\)\s*===\s*"1"\s*\|\|\s*searchParams\.get\("switch_account"\)\s*===\s*"1"/,
        "Register.tsx must detect select_account or switch_account query parameter"
      );
      assert.match(
        registerSrc,
        /<GoogleSignInButton[^>]*selectAccount=\{isSelectAccount\}/,
        "Register.tsx must pass selectAccount prop to GoogleSignInButton"
      );
    });
  });

  describe("3. Header Dropdown Clipping, Keyboard Navigation & Switch Account", () => {
    const headerSrc = fs.readFileSync(headerPath, "utf-8");

    test("Header tracks dynamic alignment to prevent clipping", () => {
      assert.match(
        headerSrc,
        /const\s+\[dropdownAlign,\s*setDropdownAlign\]\s*=\s*useState<"right"\s*\|\s*"left">\("right"\);/,
        "Must track dropdownAlign state"
      );
      assert.match(
        headerSrc,
        /if\s*\(rect\.right\s*-\s*menuWidth\s*<\s*12\)\s*\{\s*setDropdownAlign\("left"\);\s*\}\s*else\s*\{\s*setDropdownAlign\("right"\);\s*\}/,
        "Must calculate right edge clearance and switch to left-0 when clipping risk exists"
      );
    });

    test("Header handles keyboard navigation (Escape, ArrowDown, ArrowUp)", () => {
      assert.match(
        headerSrc,
        /handleAccountKeyDown/,
        "Header must implement handleAccountKeyDown"
      );
      assert.match(
        headerSrc,
        /e\.key\s*===\s*"Escape"/,
        "Must handle Escape key by closing menu and returning focus"
      );
      assert.match(
        headerSrc,
        /e\.key\s*===\s*"ArrowDown"\s*\|\|\s*e\.key\s*===\s*"ArrowUp"/,
        "Must handle ArrowDown and ArrowUp to cycle focus through menu items"
      );
    });

    test("Header renders user avatar with referrerPolicy and fallback initials", () => {
      assert.match(
        headerSrc,
        /user\.avatar\s*\|\|\s*user\.picture/,
        "Must check for user avatar or picture"
      );
      assert.match(
        headerSrc,
        /referrerPolicy="no-referrer"/,
        "Must use referrerPolicy=no-referrer for Google hosted profile images"
      );
    });

    test("Header includes Switch Account button in dropdown and drawer", () => {
      assert.match(
        headerSrc,
        /handleSwitchAccount/,
        "Header must define handleSwitchAccount handler"
      );
      assert.match(
        headerSrc,
        /window\.google\.accounts\.id\.disableAutoSelect\(\)/,
        "Switch account must call Google disableAutoSelect"
      );
      assert.match(
        headerSrc,
        /navigate\("\/login\?select_account=1"\)/,
        "Switch account must navigate to /login?select_account=1"
      );
      assert.match(
        headerSrc,
        /Switch Account/,
        "Dropdown and drawer must render Switch Account button"
      );
    });
  });

  describe("4. CustomerSidebar Profile Avatar Support", () => {
    const sidebarSrc = fs.readFileSync(sidebarPath, "utf-8");

    test("CustomerSidebar renders avatar in mobile profile header", () => {
      assert.match(
        sidebarSrc,
        /const\s+avatarUrl\s*=\s*user\?\.avatar\s*\|\|\s*user\?\.picture;/,
        "CustomerSidebar must read avatarUrl from user"
      );
      assert.match(
        sidebarSrc,
        /img[\s\S]*?src=\{avatarUrl\}[\s\S]*?referrerPolicy="no-referrer"/,
        "CustomerSidebar must render img with avatarUrl and referrerPolicy"
      );
    });
  });

  describe("5. AuthContext & authService Google Auto-Select Reset & State Persistence", () => {
    test("AuthContext logout resets Google auto-selection", () => {
      const authCtxSrc = fs.readFileSync(authCtxPath, "utf-8");
      assert.match(
        authCtxSrc,
        /window\.google\.accounts\.id\.disableAutoSelect\(\)/,
        "AuthContext logout must call disableAutoSelect"
      );
    });

    test("authService maps and caches avatar and picture", () => {
      const authSvcSrc = fs.readFileSync(authSvcPath, "utf-8");
      assert.match(
        authSvcSrc,
        /avatar:\s*\(profile as any\)\.avatar\s*\|\|\s*\(profile as any\)\.picture/,
        "authService must map avatar and picture from backend profile"
      );
      assert.match(
        authSvcSrc,
        /mapped\.avatar\s*=\s*parsed\.avatar\s*\|\|\s*parsed\.picture/,
        "authService getCurrentUser must preserve cached avatar"
      );
    });
  });

  describe("6. Backend Google Identity Claims & Avatar Verification", () => {
    test("google_identity.py extracts picture claim from Google ID token", () => {
      const idPySrc = fs.readFileSync(googleIdentityPyPath, "utf-8");
      assert.match(
        idPySrc,
        /'picture':\s*\(payload\.get\('picture'\)\s*or\s*''\)\.strip\(\)/,
        "Backend Google ID token verification must extract picture claim"
      );
    });

    test("views.py passes avatar and picture in user authentication response", () => {
      const viewsPySrc = fs.readFileSync(viewsPyPath, "utf-8");
      assert.match(
        viewsPySrc,
        /user_data\['avatar'\]\s*=\s*claims\['picture'\]/,
        "Backend views must attach avatar claim to user response"
      );
    });
  });
});
