String normalizeName(String value) {
  final lower = value.toLowerCase().trim();
  return lower.replaceAll(RegExp(r'[^a-z0-9가-힣]'), '');
}

double nameSimilarity(String source, String target) {
  final a = normalizeName(source);
  final b = normalizeName(target);
  if (a.isEmpty || b.isEmpty) {
    return 0;
  }
  if (a == b) {
    return 1;
  }
  if (a.contains(b) || b.contains(a)) {
    final shorter = a.length < b.length ? a.length : b.length;
    final longer = a.length > b.length ? a.length : b.length;
    return shorter / longer;
  }

  final gramsA = _bigrams(a);
  final gramsB = _bigrams(b);
  if (gramsA.isEmpty || gramsB.isEmpty) {
    return 0;
  }
  final intersection = gramsA.intersection(gramsB).length;
  final union = gramsA.union(gramsB).length;
  return union == 0 ? 0 : intersection / union;
}

Set<String> _bigrams(String input) {
  if (input.length <= 1) {
    return {input};
  }
  final result = <String>{};
  for (int i = 0; i < input.length - 1; i++) {
    result.add(input.substring(i, i + 2));
  }
  return result;
}
