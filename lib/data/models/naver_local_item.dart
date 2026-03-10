class NaverLocalItem {
  const NaverLocalItem({
    required this.title,
    required this.address,
    required this.roadAddress,
    required this.category,
    required this.link,
  });

  final String title;
  final String address;
  final String roadAddress;
  final String category;
  final String link;

  factory NaverLocalItem.fromJson(Map<String, dynamic> json) {
    return NaverLocalItem(
      title: _stripHtml((json['title'] ?? '').toString()),
      address: (json['address'] ?? '').toString(),
      roadAddress: (json['roadAddress'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      link: (json['link'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'title': title,
      'address': address,
      'roadAddress': roadAddress,
      'category': category,
      'link': link,
    };
  }

  String get displayAddress => roadAddress.isNotEmpty ? roadAddress : address;
}

String _stripHtml(String input) {
  return input.replaceAll(RegExp(r'<[^>]*>'), '');
}
