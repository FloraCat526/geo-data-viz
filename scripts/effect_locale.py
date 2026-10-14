"""Translate only template text, before any input data is inserted."""
EN = {
    'lang="zh-CN"': 'lang="en"',
    '暂停动画': 'Pause', '播放动画': 'Play', '正在加载地图…': 'Loading map…',
    '地图资源加载失败，请检查网络后刷新。': 'Map resources failed. Check your connection and reload.',
    '位置数量：': 'Locations: ', '聚合值：': 'Value: ', '无指标数据': 'No metric',
    '有效指标：': 'Valid: ', ' · 缺失：': ' · Missing: ',
    '切换 3D': 'Show 3D', '切换平面': 'Show 2D', '蜂窝边长': 'Hexagon side',
    '连接': 'Connections', '没有可显示的数据': 'No data to display',
    '可视化初始化失败：': 'Visualization failed: ', '初始化失败：': 'Initialization failed: ',
    '个蜂窝': 'cells', '个位置': 'locations', '点数': 'Count', '总和': 'Sum', '均值': 'Mean',
    '。3D 高度：每单位 ': '; 3D height: ', '米，非实际建筑高度。': ' metres per unit; not building height.',
    '颜色：青 → 紫 → 粉': 'Color: cyan → purple → pink',
    '弧线高度与流光仅示意连接及方向，不代表实际航迹、飞行高度或频次。': 'Arcs and trails illustrate connections and direction, not actual tracks, altitude or frequency.',
    '呼吸光晕用于强调位置，不代表影响范围或实时状态。': 'Pulses emphasize locations, not impact areas or live status.',
    '扫描半径是可视化参数，不代表实际雷达覆盖或实时回波。': 'Scan radius is a visual parameter, not measured radar coverage or live returns.',
}


def translate(template, locale):
    if locale == 'en':
        for source in sorted(EN, key=len, reverse=True):
            template = template.replace(source, EN[source])
    return template
