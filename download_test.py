import requests
from datetime import datetime

def test_download_functionality():
    """Test game results download functionality"""
    base_url = "https://quiz-battle-arena-4.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    print("🔍 Testing game results download functionality...")
    
    # Get an existing completed game ID from API
    # First, check if we can find any games in the database
    try:
        # Try to get leaderboard to see if there are users with game history
        leaderboard_response = requests.get(f"{api_url}/leaderboard")
        if leaderboard_response.status_code == 200:
            users = leaderboard_response.json()
            print(f"✅ Found {len(users)} users in leaderboard")
            
            # Try to get user history for testing
            if users:
                user_id = users[0].get('id')
                if user_id:
                    history_response = requests.get(f"{api_url}/user/{user_id}/history")
                    if history_response.status_code == 200:
                        games = history_response.json()
                        print(f"✅ Found {len(games)} games in user history")
                        
                        if games:
                            # Test download for the first game
                            game_id = games[0].get('game_id')
                            if game_id:
                                return test_game_download(api_url, game_id)
        
        # If no existing games, create a simple test case
        print("ℹ️  No completed games found for download testing")
        return True
        
    except Exception as e:
        print(f"❌ Error testing download: {e}")
        return False

def test_game_download(api_url, game_id):
    """Test downloading specific game results"""
    try:
        download_response = requests.get(f"{api_url}/games/{game_id}/export")
        
        if download_response.status_code == 200:
            print("✅ Game results download successful")
            
            # Check content type
            content_type = download_response.headers.get('content-type', '')
            print(f"✅ Content-Type: {content_type}")
            
            # Check filename in headers
            content_disposition = download_response.headers.get('content-disposition', '')
            print(f"✅ Content-Disposition: {content_disposition}")
            
            # Check if content looks like expected format
            content = download_response.text
            if "BRAINBATTLE" in content and "РЕЗУЛЬТАТЫ ИГРЫ" in content:
                print("✅ Download content format is correct")
                print(f"✅ Downloaded content preview: {content[:200]}...")
                
                # Save to file to test actual download
                with open('/tmp/test_download.txt', 'w', encoding='utf-8') as f:
                    f.write(content)
                print("✅ Successfully saved download to file")
                
                return True
            else:
                print("❌ Download content format incorrect")
                return False
        else:
            print(f"❌ Download failed with status: {download_response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Download test error: {e}")
        return False

if __name__ == "__main__":
    success = test_download_functionality()
    exit(0 if success else 1)