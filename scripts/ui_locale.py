"""Translate only trusted template copy before inserting user data or modules."""
EN = {
'地点相对密度':'Relative location density','指标加权相对密度':'Relative metric-weighted density',
'zh-CN':'en',
'交互地图':'Interactive map','地图分析面板':'Map analysis','收起':'Collapse','展开':'Expand',
'筛选与效果':'Filters and effects','正在准备地图…':'Preparing map…','浏览记录':'Browse records','加载更多记录':'Load more records','重置视野':'Reset view','图例':'Legend','重试加载':'Retry loading',
'指标着色':'Metric colors','位置点':'Locations','数量气泡':'Bubbles','点聚合':'Clusters','热力':'Heatmap','路线':'Routes','区域设色':'Choropleth','区域拉伸':'Extrusion',
'筛选结果 / 全部 ':'Filtered / Total ','记录数':'Records','指标缺失':'Missing metric','类别':'Category','筛选后':'Filtered ', '合计':'Total','均值':'Mean','无量纲':'dimensionless',
' 条指标缺失，未计入统计':' missing metrics excluded from statistics','记录列表':'Records',
'未提供':'Not provided','时间':'Time','聚合包含 ':'Cluster contains ',' 条记录':' records','查看成员':'View members','已显示 ':'Loaded ','，继续加载':', load more','成员加载失败，请重新点击。':'Could not load members. Click again.',
'当前视图相对密度':'Relative density in current view','面积 ∝ ':'Area ∝ ','指标绝对值':'absolute metric','指标':'Metric','全量指标为零或缺失':'All values are zero or missing','十字：微小值位置；空心点：零值':'Cross: tiny value location; hollow point: zero',
'低相对密度':'Lower density','高相对密度':'Higher density','圆内数字 = 记录数，聚合范围随缩放变化':'Numbers count records; clusters change with zoom','颜色区分类别或指标，线宽不表示流量':'Color encodes category or metric; width does not encode flow',' 米显示高度（非实测楼高）':' m display height (not measured building height)',
'指标颜色':'Metric color','缺失值（有别于零）':'Missing (distinct from zero)','没有匹配结果，请调整筛选条件。':'No matches. Adjust the filters.',
'正在加载数据效果…':'Loading visualization…','可视化效果':'Visualization','新效果加载失败，已保留原效果。请检查数据条件或网络。':'Could not load the new effect. Previous effect retained; check data or network.',
'地图已就绪':'Map ready','3D 高度':'3D height','全部类别':'All categories','类别筛选':'Category filter','选择类别':'Choose category','搜索名称':'Search names','日期范围':'Date range','开始日期':'Start date','结束日期':'End date','按来源时间的日历日期筛选；未提供时间的记录不计入日期范围。':'Filter by source calendar date; records without dates are excluded from date ranges.',
'清空筛选':'Clear filters','地图主题':'Map theme','深色':'Dark','浅色':'Light','正在切换地图风格…':'Changing map theme…','再次点击聚合点可继续查看成员。':'Click the cluster again to view its members.',
'新风格未能加载，已恢复原风格。':'Could not load theme; previous theme restored.','底图暂不可用，请检查网络后重试。':'Basemap unavailable. Check the network and retry.',
'数据日期 ':'Data dates ', '待接入：未提供 Mapbox 浏览器 Token。请通过已授权配置重新生成 HTML。':'Mapbox public token missing. Regenerate HTML with an authorized configuration.',
'正在加载地图服务…':'Loading map service…','网络、Token 权限与来源限制':'network, token permissions and origin restrictions','网络及 OpenFreeMap 底图服务（无需 Key）':'network and OpenFreeMap service (no key required)',
'地图尚未就绪，请检查':'Map not ready. Check ','地图资源请求失败，请检查':'Map resource request failed. Check ',
'地图鉴权失败，请检查 Token 权限与来源限制。':'Map authorization failed. Check token permissions and origin restrictions.',
'数据层配置未通过检查，请核对指标与几何类型。':'Data layer validation failed. Check metrics and geometry types.',
' SDK 未能加载，请检查网络和浏览器环境。':' SDK failed to load. Check network and browser environment.',
'（':' (','）':')','。':'.',
}

def localize_template(template, locale):
    if locale == 'zh-CN':
        return template
    import re
    # A single pass prevents shorter terms from rewriting translated phrases.
    return re.sub('|'.join(re.escape(k) for k in sorted(EN, key=len, reverse=True)), lambda m: EN[m[0]], template)
