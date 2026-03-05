package com.minton.watch

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

// ========= 1. Networking (Retrofit) =========
data class TeamScore(val name: String, val score: Int)
data class MatchStatus(
    val match_id: Int,
    val status: String,
    val current_set: Int,
    val sport_type: String?,
    val t1: TeamScore,
    val t2: TeamScore
)
data class ScoreUpdateRequest(val team: Int, val action: String)
data class ScoreUpdateResponse(val success: Boolean, val new_score: Int)

interface ScoreboardApi {
    @GET("api/watch/{tid}/court/{courtId}")
    suspend fun getCourtStatus(@Path("tid") tid: Int, @Path("courtId") courtId: Int): MatchStatus

    @POST("api/watch/{tid}/match/{matchId}/score")
    suspend fun updateScore(
        @Path("tid") tid: Int,
        @Path("matchId") matchId: Int,
        @Body req: ScoreUpdateRequest
    ): ScoreUpdateResponse
}

// Retrofit 클라이언트 설정 (개발 PC IP 혹은 도메인으로 변경 필수)
// 예: "http://192.168.0.x:8787/" 또는 Cloudflare 터널 도메인
const val BASE_URL = "https://badminton-tournament-5ny.pages.dev/" 

object ApiClient {
    val api: ScoreboardApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ScoreboardApi::class.java)
    }
}

// ========= 2. Main Activity =========
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ScoreboardWearApp(context = this)
        }
    }
}

// ========= 3. Composable UI =========
@Composable
fun ScoreboardWearApp(context: Context) {
    var matchInfo by remember { mutableStateOf<MatchStatus?>(null) }
    var errorMessage by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    val formatScore = { s: Int, os: Int, sportType: String? ->
        if (sportType == "tennis") {
            if (s <= 3 && os <= 3) {
                if (s == 3 && os == 3) "40"
                else arrayOf("0", "15", "30", "40")[s]
            } else if (s == os) {
                "40"
            } else if (s > os) {
                if (s - os >= 2) "WIN" else "AD"
            } else {
                "40"
            }
        } else {
            s.toString()
        }
    }

    // 햅틱 진동 헬퍼
    val triggerHaptic = {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    // 초기 통신 및 Polling
    LaunchedEffect(Unit) {
        while (true) {
            try {
                // 임시로 tid=1, courtId=1 로 고정 
                matchInfo = ApiClient.api.getCourtStatus(1, 1)
                errorMessage = ""
            } catch (e: Exception) {
                Log.e("ScoreboardApp", "Fetch error: ${e.message}")
                errorMessage = "대기중.."
            }
            delay(5000) // 5초 주기 폴링
        }
    }

    val onScoreClick: (Int, String) -> Unit = { teamIdx, action ->
        triggerHaptic()
        matchInfo?.let { match ->
            // 낙관적 UI 업데이트 (바로 반영)
            val oldInfo = match
            val currentT1Score = if (teamIdx == 1 && action == "+1") oldInfo.t1.score + 1 else oldInfo.t1.score
            val currentT2Score = if (teamIdx == 2 && action == "+1") oldInfo.t2.score + 1 else oldInfo.t2.score
            
            matchInfo = oldInfo.copy(
                t1 = oldInfo.t1.copy(score = currentT1Score),
                t2 = oldInfo.t2.copy(score = currentT2Score)
            )

            // 서버 전송
            scope.launch(Dispatchers.IO) {
                try {
                    ApiClient.api.updateScore(1, match.match_id, ScoreUpdateRequest(teamIdx, action))
                } catch (e: Exception) {
                    Log.e("ScoreboardApp", "Update error: ${e.message}")
                   // 실패 시 원복 로직 추가 가능
                }
            }
        }
    }

    if (matchInfo == null) {
        Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Text(text = if (errorMessage.isEmpty()) "로딩중..." else errorMessage, color = Color.White)
        }
        return
    }

    val match = matchInfo!!
    
    // UI: 화면을 위아래 또는 좌우 반으로 나누어 처리 (여기는 좌우 방식)
    Row(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        // Team 1 (Left)
        Box(modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .background(Color(0xFF0F172A))
            .clickable { onScoreClick(1, "+1") },
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = match.t1.name.take(5), color = Color.Gray, fontSize = 12.sp)
                val displayScore = formatScore(match.t1.score, match.t2.score, match.sport_type)
                Text(
                    text = displayScore,
                    color = if (displayScore == "WIN") Color(0xFFFDE047) else Color(0xFF10B981),
                    fontSize = if (displayScore.length > 2) 36.sp else 48.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        // Divider
        Box(modifier = Modifier.width(2.dp).fillMaxHeight().background(Color.DarkGray))

        // Team 2 (Right)
        Box(modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .background(Color(0xFF0F172A))
            .clickable { onScoreClick(2, "+1") },
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = match.t2.name.take(5), color = Color.Gray, fontSize = 12.sp)
                val displayScore = formatScore(match.t2.score, match.t1.score, match.sport_type)
                Text(
                    text = displayScore,
                    color = if (displayScore == "WIN") Color(0xFFFDE047) else Color(0xFFEF4444),
                    fontSize = if (displayScore.length > 2) 36.sp else 48.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
