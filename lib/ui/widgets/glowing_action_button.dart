import 'dart:math';
import 'package:flutter/material.dart';

class GlowingActionButton extends StatefulWidget {
  const GlowingActionButton({
    required this.onTap,
    required this.label,
    this.isLoading = false,
    this.icon,
    super.key,
  });

  final VoidCallback? onTap;
  final bool isLoading;
  final String label;
  final IconData? icon;

  @override
  State<GlowingActionButton> createState() => _GlowingActionButtonState();
}

class _GlowingActionButtonState extends State<GlowingActionButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(
        milliseconds: 4000,
      ), // 성능을 위해 훨씬 느리고 부드럽게 돌아가도록 수정
    )..repeat(); // 단방향으로 영구 회전하도록 수정
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null && !widget.isLoading) {
      // 비활성화 상태도 버튼의 기본적인 디자인(다크) 형태를 유지하여 이질감 해소
      return Container(
        width: double.infinity,
        height: 56,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          color: const Color(0xFF2B2B2D), // 다크 그레이 톤 유지
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.1),
            width: 1.0,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (widget.icon != null)
              Icon(
                widget.icon,
                color: Colors.white.withValues(alpha: 0.3),
                size: 24,
              ),
            if (widget.icon != null) const SizedBox(width: 8),
            Text(
              widget.label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.3),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: widget.isLoading ? null : widget.onTap,
      child: SizedBox(
        height: 56,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            // 크기 커지는 애니메이션 제거. 스피닝 중에만 살짝 눌린 효과 유지.
            return Transform.scale(
              scale: widget.isLoading ? 0.95 : 1.0,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // 1. 외곽 빛 번짐
                  Container(
                    width: double.infinity,
                    height: 56,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(
                            0xFFC764D6,
                          ).withValues(alpha: 0.35),
                          blurRadius: 25,
                          spreadRadius: 4,
                        ),
                        BoxShadow(
                          color: const Color(0xFF6328A0).withValues(alpha: 0.3),
                          blurRadius: 25,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                  ),
                  // 2. 배경 와이드 그래디언트 및 링
                  Container(
                    width: double.infinity,
                    height: 56,
                    clipBehavior: Clip.hardEdge,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      // 하단 버튼의 방사형을 긴 버튼에 맞게 선형으로 변형
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFFFF0055), // Crimson
                          Color(0xFFC2125D), // 중간 영역 (자줏빛)
                          Color(0xFF381060), // 어두운 보라 (베이스)
                        ],
                        stops: [0.0, 0.4, 1.0],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.3),
                        width: 1.0,
                      ),
                    ),
                    child: Stack(
                      children: [
                        // 성능 최적화: 복잡한 다중 컨테이너 대신 단일 스윕 그라데이션이 천천히 회전하게 만듦
                        Positioned.fill(
                          child: AnimatedBuilder(
                            animation: _controller,
                            builder: (context, child) {
                              return Transform.rotate(
                                angle: _controller.value * 2 * pi,
                                child: Transform.scale(
                                  // 전체 버튼 너비를 완전히 덮도록 스케일 대폭 확장
                                  scale: 15.0,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: SweepGradient(
                                        colors: [
                                          Colors.white.withValues(alpha: 0.0),
                                          const Color(
                                            0xFFFF3D00,
                                          ).withValues(alpha: 0.2), // 오렌지 빛깔
                                          const Color(
                                            0xFFFF007F,
                                          ).withValues(alpha: 0.3), // 핑크 빛깔
                                          const Color(
                                            0xFFFFC107,
                                          ).withValues(alpha: 0.4), // 앰버 포인트
                                          Colors.white.withValues(alpha: 0.0),
                                        ],
                                        stops: const [0.0, 0.2, 0.5, 0.8, 1.0],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  // 3. 버튼 텍스트와 아이콘
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (widget.isLoading)
                        const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      else if (widget.icon != null)
                        Icon(widget.icon, color: Colors.white, size: 24),
                      if (widget.icon != null || widget.isLoading)
                        const SizedBox(width: 8),
                      Text(
                        widget.label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                          shadows: [
                            Shadow(
                              color: Colors.black45,
                              blurRadius: 3,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
