import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/mood_screen.dart';
import 'ui/screens/nearby_search_screen.dart';
import 'ui/screens/roulette_result_screen.dart';
import 'ui/screens/roulette_screen.dart';
import 'ui/screens/pinball_screen.dart';
import 'ui/screens/pinball_v2_screen.dart';
import 'ui/widgets/app_background.dart';
import 'ui/widgets/glass_header.dart';
import 'ui/widgets/main_bottom_menu_bar.dart';

class FoodDecisionApp extends StatefulWidget {
  const FoodDecisionApp({super.key});

  @override
  State<FoodDecisionApp> createState() => _FoodDecisionAppState();
}

class _FoodDecisionAppState extends State<FoodDecisionApp> {
  final ValueNotifier<RouteSettings?> _routeSettingsNotifier =
      ValueNotifier<RouteSettings?>(null);
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  String? _lastRouteName;
  Offset _activePushBegin = Offset.zero;
  bool _activePushIsMainTab = false;
  late final _AppNavigatorObserver _observer = _AppNavigatorObserver(
    _routeSettingsNotifier,
  );

  @override
  void initState() {
    super.initState();
  }

  static const Map<String, int> _tabIndexMap = {
    NearbySearchScreen.routeName: 0,
    RouletteScreen.routeName: 1,
    MoodScreen.routeName: 2,
    '/': 1, // Home behaves like Roulette for tab index
  };

  int _getRouteIndex(String? name) {
    if (name == null) return -1;
    return _tabIndexMap[name] ?? -1;
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      navigatorObservers: [_observer],
      title: '메추',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      builder: (context, child) {
        return ValueListenableBuilder<RouteSettings?>(
          valueListenable: _routeSettingsNotifier,
          builder: (context, settings, _) {
            return _AppShell(
              settings: settings,
              navigatorKey: _navigatorKey,
              child: child ?? const SizedBox.shrink(),
            );
          },
        );
      },
      initialRoute: '/',
      onGenerateRoute: (settings) {
        return _buildSlideRoute(settings);
      },
    );
  }

  Route<dynamic>? _buildSlideRoute(RouteSettings settings) {
    Widget page;
    switch (settings.name) {
      case '/':
        page = const HomeScreen();
        break;
      case NearbySearchScreen.routeName:
        final args = settings.arguments;
        page = args is NearbySearchArgs
            ? NearbySearchScreen(args: args)
            : const NearbySearchScreen();
        break;
      case RouletteScreen.routeName:
        final args = settings.arguments;
        page = args is RouletteScreenArgs
            ? RouletteScreen(args: args)
            : const RouletteScreen();
        break;
      case RouletteResultScreen.routeName:
        final args = settings.arguments;
        page = args is RouletteResultArgs
            ? RouletteResultScreen(args: args)
            : RouletteResultScreen(
                args: const RouletteResultArgs(
                  resultName: '추천 메뉴',
                  query: '맛집',
                ),
              );
        break;
      case PinballScreen.routeName:
        final args = settings.arguments;
        page = args is PinballScreenArgs
            ? PinballScreen(args: args)
            : const SizedBox.shrink();
        break;
      case PinballV2Screen.routeName:
        final args = settings.arguments;
        page = args is PinballV2ScreenArgs
            ? PinballV2Screen(args: args)
            : const SizedBox.shrink();
        break;
      case MoodScreen.routeName:
        page = const MoodScreen();
        break;
      default:
        return null;
    }

    return PageRouteBuilder<void>(
      settings: settings,
      pageBuilder: (context, animation, secondaryAnimation) => page,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final hasBackStack = Navigator.of(context).canPop();
        final targetIndex = _getRouteIndex(settings.name);
        final lastIndex = _lastRouteName == null
            ? -2
            : _getRouteIndex(_lastRouteName);
        final forceVerticalHomeTransition =
            settings.name == '/' &&
            settings.arguments is Map &&
            (settings.arguments as Map)['homeVertical'] == true;
        final fromHomeToMainTabTransition =
            _lastRouteName == '/' && settings.name != '/' && targetIndex != -1;
        final isMainTabTransition =
            !forceVerticalHomeTransition &&
            targetIndex != -1 &&
            lastIndex != -1;

        Offset begin;
        if (forceVerticalHomeTransition) {
          // Header Home button keeps vertical swoop.
          begin = const Offset(0.0, -1.0);
        } else if (fromHomeToMainTabTransition) {
          // From Home to bottom main tabs should rise from bottom.
          begin = const Offset(0.0, 1.0);
        } else if (targetIndex != -1 && lastIndex != -1) {
          // Bottom menu tabs should always feel like horizontal swipe.
          if (targetIndex > lastIndex) {
            begin = const Offset(1.0, 0.0);
          } else if (targetIndex < lastIndex) {
            begin = const Offset(-1.0, 0.0);
          } else {
            begin = Offset.zero;
          }
        } else if (lastIndex == -2) {
          // If first entry
          begin = const Offset(0.0, 1.0);
        } else if (hasBackStack && settings.name != '/') {
          // Any forward navigation within a stacked flow should slide left.
          begin = const Offset(1.0, 0.0);
        } else if (targetIndex == -1) {
          // If going to sub-menu
          begin = const Offset(1.0, 0.0);
        } else {
          // Returning from sub-menu back to main menu
          begin = const Offset(-1.0, 0.0);
        }

        // Capture the currently active push direction once at push start.
        // Outgoing pages will use this to avoid "backward/rotating" feel.
        if (animation.status == AnimationStatus.forward &&
            animation.value <= 0.001) {
          _activePushBegin = begin;
          _activePushIsMainTab = isMainTabTransition;
        }

        _lastRouteName = settings.name;

        const end = Offset.zero;
        const curve = Curves.easeOutCubic;

        var tween = Tween(
          begin: begin,
          end: end,
        ).chain(CurveTween(curve: curve));
        var offsetAnimation = animation.drive(tween);

        final secondaryEnd = _activePushIsMainTab ? -_activePushBegin : -begin;
        var secondaryTween = Tween(
          begin: Offset.zero,
          end: secondaryEnd, // 움직인 방향의 반대로 밀려남
        ).chain(CurveTween(curve: curve));
        var secondaryOffsetAnimation = secondaryAnimation.drive(secondaryTween);

        return SlideTransition(
          position: secondaryOffsetAnimation,
          child: SlideTransition(position: offsetAnimation, child: child),
        );
      },
      transitionDuration: const Duration(milliseconds: 300),
    );
  }
}

class _AppShell extends StatelessWidget {
  final Widget child;
  final RouteSettings? settings;
  final GlobalKey<NavigatorState> navigatorKey;

  const _AppShell({
    required this.child,
    this.settings,
    required this.navigatorKey,
  });

  @override
  Widget build(BuildContext context) {
    final routeName = settings?.name ?? '/';
    final isPinballRoute =
        routeName == PinballScreen.routeName ||
        routeName == PinballV2Screen.routeName;

    // Determine tab
    MainMenuTab? currentTab;
    if (isPinballRoute) {
      currentTab = null;
    } else if (routeName == NearbySearchScreen.routeName) {
      currentTab = MainMenuTab.nearby;
    } else if (routeName == MoodScreen.routeName) {
      currentTab = MainMenuTab.theme;
    } else if (routeName == RouletteScreen.routeName || routeName == '/') {
      currentTab = MainMenuTab.roulette;
    } else if (routeName == RouletteResultScreen.routeName) {
      final args = settings?.arguments;
      if (args is RouletteResultArgs) {
        currentTab = args.fromMood ? MainMenuTab.theme : MainMenuTab.roulette;
      } else {
        currentTab = MainMenuTab.roulette;
      }
    }

    final bool isSubMenu = navigatorKey.currentState?.canPop() ?? false;

    // Determine AppBar (모든 화면에서 똑같은 모양의 헤더 적용)
    PreferredSizeWidget? appBar = isPinballRoute
        ? null
        : GlassHeader(
            showBackButton: isSubMenu,
            onBack: () {
              navigatorKey.currentState?.maybePop();
            },
            onTitleTap: () {
              navigatorKey.currentState?.pushNamedAndRemoveUntil(
                '/',
                (route) => false,
                arguments: const <String, bool>{'homeVertical': true},
              );
            },
          );

    if (isPinballRoute) {
      return Scaffold(
        extendBody: true,
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.black,
        body: child,
      );
    }

    return AppBackground(
      child: Scaffold(
        extendBody: true,
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: appBar,
        bottomNavigationBar: currentTab != null
            ? MainBottomMenuBar(
                currentTab: currentTab,
                onTabSelected: (tab) {
                  final targetName = switch (tab) {
                    MainMenuTab.nearby => NearbySearchScreen.routeName,
                    MainMenuTab.roulette => RouletteScreen.routeName,
                    MainMenuTab.theme => MoodScreen.routeName,
                  };
                  if (routeName == targetName) return;
                  // Always reset to a single main route so back button disappears on main menus.
                  navigatorKey.currentState?.pushNamedAndRemoveUntil(
                    targetName,
                    (route) => false,
                  );
                },
                onRouletteLongPress: () {
                  navigatorKey.currentState?.pushNamedAndRemoveUntil(
                    RouletteScreen.routeName,
                    (route) => false,
                    arguments: const RouletteScreenArgs(
                      initialMode: RouletteMode.food,
                      autoStart: true,
                    ),
                  );
                },
              )
            : null,
        body: child,
      ),
    );
  }
}

class _AppNavigatorObserver extends NavigatorObserver {
  final ValueNotifier<RouteSettings?> notifier;
  _AppNavigatorObserver(this.notifier);

  final List<Route<dynamic>> _history = [];

  void _update() {
    if (_history.isNotEmpty) {
      final activeRoute = _history.last;
      if (activeRoute.settings.name != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          notifier.value = activeRoute.settings;
        });
      }
    }
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _history.add(route);
    _update();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _history.remove(route);
    _update();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (oldRoute != null && newRoute != null) {
      final index = _history.indexOf(oldRoute);
      if (index >= 0) {
        _history[index] = newRoute;
      }
    }
    _update();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _history.remove(route);
    _update();
  }
}
