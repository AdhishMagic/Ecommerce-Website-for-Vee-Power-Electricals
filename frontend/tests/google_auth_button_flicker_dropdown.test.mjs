import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buttonPath = path.resolve(__dirname, "../src/components/auth/GoogleSignInButton.tsx");
const loginPath = path.resolve(__dirname, "../src/pages/auth/Login.tsx");
const registerPath = path.resolve(__dirname, "../src/pages/auth/Register.tsx");
const authLayoutPath = path.resolve(__dirname, "../src/components/layout/AuthLayout.tsx");
const googleIdentityPyPath = path.resolve(__dirname, "../../backend/apps/users/services/google_identity.py");
const viewsPyPath = path.resolve(__dirname, "../../backend/apps/users/views.py");

describe("Google Authentication Button: Flicker Elimination, Dropdown Clipping & Direct Sign-In", () => {
  const buttonSrc = fs.readFileSync(buttonPath, "utf-8");
  const loginSrc = fs.readFileSync(loginPath, "utf-8");
  const registerSrc = fs.readFileSync(registerPath, "utf-8");
  const layoutSrc = fs.readFileSync(authLayoutPath, "utf-8");
  const idPySrc = fs.readFileSync(googleIdentityPyPath, "utf-8");
  const viewsPySrc = fs.readFileSync(viewsPyPath, "utf-8");

  describe("Requirement 1: Eliminate Button Flicker on Page Refresh", () => {
    test("Renders a dedicated skeleton container with matching 44px button dimensions", () => {
      assert.match(
        buttonSrc,
        /data-testid="google-button-skeleton"/,
        "Must render a dedicated skeleton container while GIS initializes"
      );
      assert.match(
        buttonSrc,
        /max-w-\[340px\]\s+h-\[44px\]\s+rounded-xl\s+border\s+border-\[#D9E1E8\]/,
        "Skeleton container must match exact button dimensions: 44px height, max-w-[340px], rounded-xl"
      );
    });

    test("Skeleton does not render generic 'Continue with Google' text to prevent text flicker", () => {
      // Find the skeleton block in GoogleSignInButton.tsx
      const skeletonMatch = buttonSrc.match(/data-testid="google-button-skeleton"[\s\S]*?<\/div>\s*<\/div>/);
      assert.ok(skeletonMatch, "Skeleton container must be present in source");
      const skeletonHtml = skeletonMatch[0];
      assert.doesNotMatch(
        skeletonHtml,
        /Continue with Google/,
        "Skeleton must NOT contain the text 'Continue with Google' so generic text does not flash before 'Continue as [User]'"
      );
      assert.match(
        skeletonHtml,
        /animate-pulse/,
        "Skeleton should include a subtle neutral animated pulse bar"
      );
    });

    test("Does not force immediate localhost fallback that causes text flashes", () => {
      assert.doesNotMatch(
        buttonSrc,
        /const\s+\[gisRenderFallback,\s*setGisRenderFallback\]\s*=\s*useState\(\(\)\s*=>\s*isLocalhost\);/,
        "Must not force gisRenderFallback synchronously for localhost"
      );
      assert.match(
        buttonSrc,
        /const\s+\[gisRenderFallback,\s*setGisRenderFallback\]\s*=\s*useState\(false\);/,
        "gisRenderFallback must initialize to false so GIS has opportunity to load smoothly"
      );
    });
  });

  describe("Requirement 2: Fix Dropdown Clipping & Clickability", () => {
    test("Button outer wrapper and containerRef use min-h-[44px] and overflow-visible", () => {
      assert.match(
        buttonSrc,
        /min-h-\[44px\]\s+overflow-visible/,
        "Button wrapper must specify min-h-[44px] and overflow-visible"
      );
      assert.doesNotMatch(
        buttonSrc,
        /min-h-\[44px\]\s+h-\[44px\]/,
        "Must not constrain outer container to rigid h-[44px] that clips dropdown popup"
      );
    });

    test("GIS renderButton uses width: 340 and logo_alignment: 'left' for ample dropdown arrow space", () => {
      assert.match(
        buttonSrc,
        /window\.google\.accounts\.id\.renderButton\(containerRef\.current,\s*\{[\s\S]*?width:\s*340/,
        "renderButton must configure width: 340 to prevent squeezing user avatar, name, and dropdown arrow"
      );
      assert.match(
        buttonSrc,
        /window\.google\.accounts\.id\.renderButton\(containerRef\.current,\s*\{[\s\S]*?logo_alignment:\s*"left"/,
        "renderButton must align logo to left to provide maximum horizontal space"
      );
    });

    test("Login and Register pages wrap GoogleSignInButton in overflow-visible containers", () => {
      assert.match(
        loginSrc,
        /<div className="w-full flex justify-center overflow-visible">\s*<GoogleSignInButton/,
        "Login.tsx must wrap GoogleSignInButton in an overflow-visible container"
      );
      assert.match(
        registerSrc,
        /<div className="w-full flex justify-center overflow-visible">\s*<GoogleSignInButton/,
        "Register.tsx must wrap GoogleSignInButton in an overflow-visible container"
      );
    });

    test("AuthLayout card container specifies overflow-visible", () => {
      assert.match(
        layoutSrc,
        /max-w-\[350px\]\s+overflow-visible/,
        "AuthLayout inner column container must have overflow-visible"
      );
    });
  });

  describe("Requirement 3: Direct Sign-In vs. Account Chooser Behavior", () => {
    test("GIS initializes with auto_select: !selectAccount and only disables auto-select when selectAccount is true", () => {
      assert.match(
        buttonSrc,
        /auto_select:\s*!selectAccount/,
        "Must enable auto_select when selectAccount is false to allow direct sign-in"
      );
      assert.match(
        buttonSrc,
        /if\s*\(selectAccount\s*&&\s*window\.google\.accounts\.id\.disableAutoSelect\)\s*\{\s*window\.google\.accounts\.id\.disableAutoSelect\(\);/,
        "Must only call disableAutoSelect when selectAccount is true"
      );
    });

    test("Backend build_google_auth_url only adds prompt parameter when explicitly provided", () => {
      assert.match(
        idPySrc,
        /def build_google_auth_url\([\s\S]*?prompt:\s*str\s*\|\s*None\s*=\s*None/,
        "build_google_auth_url must accept optional prompt parameter"
      );
      assert.match(
        idPySrc,
        /if prompt:\s*params\['prompt'\] = prompt/,
        "build_google_auth_url must only attach prompt if explicitly passed"
      );
      assert.doesNotMatch(
        idPySrc,
        /'prompt':\s*'select_account'/,
        "Must not hardcode 'prompt': 'select_account' unconditionally"
      );
    });

    test("Backend GoogleOAuthInitView extracts prompt from query and passes to build_google_auth_url", () => {
      assert.match(
        viewsPySrc,
        /prompt\s*=\s*\(request\.GET\.get\('prompt'\)\s*\|\|\s*''\)\.strip\(\)|prompt\s*=\s*\(request\.GET\.get\('prompt'\)\s*or\s*''\)\.strip\(\)/,
        "GoogleOAuthInitView must read prompt from request GET"
      );
      assert.match(
        viewsPySrc,
        /build_google_auth_url\([\s\S]*?prompt=prompt\s*or\s*None/,
        "GoogleOAuthInitView must pass prompt or None to build_google_auth_url"
      );
    });
  });
});
