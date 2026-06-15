module.exports = {
    serverIp: '192.168.201.7',  // 服务器IP
    // ----------------------------- 订 阅 消 息 （subscribe） -------------------------------------------
    subscribeList: [
        // { name: 'trig', messageType: 'std_msgs/Header' }, // 消息反馈
        { name: 'move_base/result', messageType: 'move_base_msgs/MoveBaseActionResult' }, // 导航结束
        { name: 'task_node/task_state', messageType: 'task/task_state' }, // 任务状态
        { name: 'move_base/GlobalPlanner/plan', messageType: 'nav_msgs/Path' }, // 路径
        { name: 'robot_pose', messageType: 'geometry_msgs/Pose' }, // 机器人姿态
        { name: 'bunker_status', messageType: 'bunker_msgs/BunkerStatus' }, // 电量、速度
        { name: 'arm_video', messageType: 'std_msgs/String' }, // 机械臂视频
        { name: 'logs', messageType: 'rosgraph_msgs/Log' }, // 日志
        { name: 'scan_points', messageType: 'sensor_msgs/PointCloud' }, // 点云
        { name: 'diagnostics_agg', messageType: 'diagnostic_msgs/DiagnosticArray' }, // 诊断，告警
    ],
    // ----------------------------- 发 布 消 息 （publish） -------------------------------------------
    publishList: [
        { name: 'joy', messageType: 'sensor_msgs/Joy' }, // 底盘、云台、机械臂控制
        { name: 'trig', messageType: 'std_msgs/Header' }, // 夹爪操控 seq:0  张开 seq：100 抓取, 底座标定
        { name: 'task_nodes', messageType: 'task/task_info' }, // 发送任务
        { name: 'set_goal_node', messageType: 'std_msgs/String' }, // 导航
        { name: 'move_base/cancel', messageType: 'actionlib_msgs/GoalID' }, // 取消导航
        { name: 'initialpose', messageType: 'geometry_msgs/PoseWithCovarianceStamped' }, // 重定位
        { name: 'system_cmd', messageType: 'std_msgs/String' }, // 重启程序, 重启工控机
        { name: 'go_charging', messageType: 'std_msgs/Bool' }, // 回库
        { name: 'estop', messageType: 'std_msgs/Bool' }, // 急停
        { name: 'flexbe_trig', messageType: 'std_msgs/Header' }, // flexbe操作
    ]
};