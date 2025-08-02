-- ===============================================
-- RFID Inventory System - Database Schema
-- ===============================================
-- Complete schema for fresh installations
-- Generated from production database analysis

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- ===============================================
-- Table: item
-- Main RFID inventory items table
-- ===============================================
CREATE TABLE `item` (
  `id` bigint(15) NOT NULL AUTO_INCREMENT,
  `epc` varchar(255) NOT NULL,
  `mac_address` varchar(255) DEFAULT 'MAC_ADDRESS_DEFAULT',
  `reader_name` varchar(255) DEFAULT 'No name',
  `brand` varchar(255) DEFAULT 'No Brand',
  `model` varchar(255) DEFAULT 'No Model',
  `serial_number` varchar(255) DEFAULT 'XXXX-XXXX-XXXX-XXXX',
  `image` varchar(255) DEFAULT 'default.jpg',
  `inventory_code` varchar(255) DEFAULT '0000',
  `category` varchar(255) DEFAULT 'No Type',
  `updated_at` datetime DEFAULT NULL,
  `epc_timestamp` varchar(255) NOT NULL DEFAULT '',
  `antenna` varchar(255) DEFAULT '0',
  `group_id` bigint(255) DEFAULT 9,
  `designation` varchar(255) DEFAULT 'No_Des',
  `color` varchar(11) DEFAULT NULL,
  `show_in_main` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `epc` (`epc`),
  KEY `idx_updated_at` (`updated_at`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_show_in_main` (`show_in_main`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===============================================
-- Table: hist  
-- Movement history automatically populated by trigger
-- ===============================================
CREATE TABLE `hist` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `epchist` varchar(64) DEFAULT NULL COMMENT 'References item.epc',
  `dep` datetime DEFAULT NULL COMMENT 'Departure timestamp',
  `ret` datetime DEFAULT NULL COMMENT 'Return timestamp', 
  `antenna_dep` varchar(11) DEFAULT NULL COMMENT 'Departure antenna',
  `antenna_ret` varchar(11) DEFAULT NULL COMMENT 'Return antenna',
  PRIMARY KEY (`id`),
  KEY `idx_epchist` (`epchist`),
  KEY `idx_ret` (`ret`),
  KEY `idx_dep` (`dep`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ===============================================
-- Table: groupname
-- Categories/groups for inventory items
-- ===============================================
CREATE TABLE `groupname` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` varchar(11) DEFAULT NULL,
  `group_name` varchar(11) DEFAULT NULL,
  `color` varchar(16) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===============================================
-- TRIGGER: tr_historique
-- Automatically creates movement history entries
-- ===============================================
-- When an item's updated_at changes by more than 15 minutes (900 seconds),
-- automatically create a history record showing movement between antennas
DELIMITER $$
CREATE TRIGGER `tr_historique` 
BEFORE UPDATE ON `item` 
FOR EACH ROW 
BEGIN
    IF UNIX_TIMESTAMP(NEW.updated_at) - UNIX_TIMESTAMP(OLD.updated_at) > 900 THEN
        INSERT INTO hist (epchist, dep, ret, antenna_dep, antenna_ret) 
        VALUES (NEW.epc, OLD.updated_at, NEW.updated_at, OLD.antenna, NEW.antenna);
    END IF;
END$$
DELIMITER ;

-- ===============================================
-- Sample Data: Default Groups
-- ===============================================
INSERT INTO `groupname` (`group_id`, `group_name`, `color`) VALUES
('1', 'ENG1', '#1e40af'),
('2', 'ENG2', '#dc2626'), 
('3', 'ENG3', '#059669'),
('4', 'ENG4', '#7c2d12'),
('5', 'SPARE', '#4338ca'),
('6', 'LiveU', '#be185d'),
('7', 'FS7', '#0891b2'),
('8', 'Accessoir', '#65a30d'),
('9', 'ZZ_Not_Reg', '#6b7280'),
('10', 'LUMIERES', '#f59e0b'),
('11', 'KITSON', '#8b5cf6'),
('12', 'DATAS', '#0d9488'),
('13', 'Alpha7s', '#db2777'),
('14', 'ZZ_LOST', '#ef4444');

COMMIT;

-- ===============================================
-- Post-Installation Notes
-- ===============================================
-- 1. The trigger automatically manages movement history
-- 2. Default group_id=9 represents unregistered items
-- 3. EPC field must be unique across all inventory items
-- 4. Updated_at changes trigger history creation after 15min gaps
-- 5. Frontend expects specific group colors for UI display
-- ===============================================