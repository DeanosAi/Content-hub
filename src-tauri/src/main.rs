#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct MetricsResponse {
    views: u64,
    likes: u64,
    comments: u64,
    shares: u64,
    engagement_rate: f64,
}

/// Detect platform from URL
fn detect_platform(url: &str) -> &'static str {
    if url.contains("instagram.com") {
        "instagram"
    } else if url.contains("tiktok.com") {
        "tiktok"
    } else if url.contains("youtube.com") || url.contains("youtu.be") {
        "youtube"
    } else {
        "unknown"
    }
}

/// Run an Apify actor synchronously and return the dataset items.
/// Uses the "run-sync-get-dataset-items" endpoint so we get results in one call.
async fn run_apify_actor(
    client: &reqwest::Client,
    api_key: &str,
    actor_id: &str,
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    let url = format!(
        "https://api.apify.com/v2/acts/{}/run-sync-get-dataset-items?token={}",
        actor_id, api_key
    );

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&input)
        .send()
        .await
        .map_err(|e| format!("Apify request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read Apify response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Apify API error ({}): {}", status, &body[..body.len().min(500)]));
    }

    let items: Vec<serde_json::Value> = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Apify response: {} — body: {}", e, &body[..body.len().min(300)]))?;

    Ok(items)
}

/// Fetch Instagram post metrics via Apify
async fn fetch_instagram_metrics(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
) -> Result<MetricsResponse, String> {
    let input = serde_json::json!({
        "username": [url],
        "resultsLimit": 1
    });

    let items = run_apify_actor(client, api_key, "apify~instagram-post-scraper", input).await?;

    if items.is_empty() {
        return Err("No data returned from Instagram scraper. The post may be private or the URL invalid.".to_string());
    }

    let post = &items[0];

    let likes = post["likesCount"].as_u64().unwrap_or(0);
    let comments = post["commentsCount"].as_u64().unwrap_or(0);
    // videoPlayCount is the total plays, videoViewCount is unique views
    let views = post["videoPlayCount"].as_u64()
        .or_else(|| post["videoViewCount"].as_u64())
        .unwrap_or(0);
    let shares = 0u64; // Instagram doesn't expose share count publicly

    // Use views if available, otherwise estimate from likes
    let base = if views > 0 { views } else { likes * 10 }; // rough estimate for image posts
    let engagement_rate = if base > 0 {
        ((likes + comments) as f64 / base as f64) * 100.0
    } else {
        0.0
    };

    Ok(MetricsResponse {
        views,
        likes,
        comments,
        shares,
        engagement_rate: (engagement_rate * 100.0).round() / 100.0,
    })
}

/// Fetch TikTok post metrics via Apify
async fn fetch_tiktok_metrics(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
) -> Result<MetricsResponse, String> {
    let input = serde_json::json!({
        "postURLs": [url],
        "resultsPerPage": 1
    });

    let items = run_apify_actor(client, api_key, "clockworks~free-tiktok-scraper", input).await?;

    if items.is_empty() {
        return Err("No data returned from TikTok scraper. The post may be private or the URL invalid.".to_string());
    }

    let post = &items[0];

    let views = post["playCount"].as_u64()
        .or_else(|| post["plays"].as_u64())
        .or_else(|| post["videoMeta"].as_object().and_then(|m| m["playCount"].as_u64()))
        .unwrap_or(0);
    let likes = post["diggCount"].as_u64()
        .or_else(|| post["likes"].as_u64())
        .unwrap_or(0);
    let comments = post["commentCount"].as_u64()
        .or_else(|| post["comments"].as_u64())
        .unwrap_or(0);
    let shares = post["shareCount"].as_u64()
        .or_else(|| post["shares"].as_u64())
        .unwrap_or(0);

    let engagement_rate = if views > 0 {
        ((likes + comments + shares) as f64 / views as f64) * 100.0
    } else {
        0.0
    };

    Ok(MetricsResponse {
        views,
        likes,
        comments,
        shares,
        engagement_rate: (engagement_rate * 100.0).round() / 100.0,
    })
}

#[tauri::command]
async fn fetch_metrics_with_ai(url: String, api_key: String) -> Result<MetricsResponse, String> {
    // api_key parameter now expects the Apify token
    if api_key.is_empty() {
        return Err("API key is empty. Please add your Apify API token in Settings.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120)) // Apify actors can take a minute
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let platform = detect_platform(&url);

    match platform {
        "instagram" => fetch_instagram_metrics(&client, &api_key, &url).await,
        "tiktok" => fetch_tiktok_metrics(&client, &api_key, &url).await,
        "youtube" => {
            Err("For YouTube, use the YouTube Data API import in Reports instead. YouTube metrics don't require scraping.".to_string())
        }
        _ => Err(format!("Unsupported platform. URL must be from Instagram or TikTok. Got: {}", url))
    }
}

#[tauri::command]
async fn open_file_or_url(path: String) -> Result<(), String> {
    // For URLs, open in default browser. For local paths, open with default app.
    open::that(&path).map_err(|e| format!("Failed to open: {}", e))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![fetch_metrics_with_ai, open_file_or_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
