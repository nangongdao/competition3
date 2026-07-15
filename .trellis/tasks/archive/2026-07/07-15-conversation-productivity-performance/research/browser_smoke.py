from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


artifact_dir = Path(
    ".trellis/tasks/07-15-conversation-productivity-performance/research/artifacts"
)
artifact_dir.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        permissions=["clipboard-read", "clipboard-write"],
    )
    page = context.new_page()
    page_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.goto(
        "http://127.0.0.1:5173",
        wait_until="domcontentloaded",
        timeout=60_000,
    )
    try:
        page.wait_for_load_state("networkidle", timeout=5_000)
    except PlaywrightTimeoutError:
        pass

    page.locator(".dialogue-board").wait_for()
    page.locator(".conversation-actions > button").nth(0).wait_for()
    page.locator(".conversation-actions > button").nth(1).wait_for()

    copy_button = page.locator(".transcript-entry-actions button").first
    copy_button.click()
    page.wait_for_timeout(150)

    page.locator(".conversation-clear-button").click()
    page.locator(".conversation-clear-confirm").wait_for()
    page.locator(".conversation-clear-confirm button").nth(1).click()

    page.screenshot(path=str(artifact_dir / "desktop.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(artifact_dir / "mobile.png"), full_page=True)

    if page_errors:
        raise RuntimeError(f"Browser page errors: {page_errors}")

    print("browser smoke passed")
    browser.close()
