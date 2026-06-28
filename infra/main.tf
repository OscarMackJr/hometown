# Multi-Cloud Agnostic Core Routing Definitions for Dark Factory Runtime Architecture
# Establishes the decoupled AWS & Azure network peering boundaries where Cube.js bridges queries.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "azurerm" {
  features {}
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

# --- AWS Infrastructure Resources (CRM Component Storage) ---
resource "aws_vpc" "factory_vpc_aws" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "dark-factory-vpc-aws" }
}

resource "aws_db_instance" "crm_postgres" {
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "15"
  instance_class       = "db.t4g.micro"
  db_name              = "crm_db"
  username             = "factory_admin"
  password             = "DeterministicSecretToken2026!"
  skip_final_snapshot  = true
  publicly_accessible  = false
}

# --- Azure Infrastructure Resources (Financial Ledger Node) ---
resource "azurerm_resource_group" "factory_rg" {
  name     = "dark-factory-resources"
  location = "East US"
}

resource "azurerm_mssql_server" "ledger_sql_server" {
  name                         = "df-ledger-sqlserver"
  resource_group_name          = azurerm_resource_group.factory_rg.name
  location                     = azurerm_resource_group.factory_rg.location
  version                      = "12.0"
  administrator_login          = "factory_admin"
  administrator_login_password = "DeterministicSecretToken2026!"
}

resource "azurerm_mssql_database" "ledger_db" {
  name         = "ledger_db"
  server_id    = azurerm_mssql_server.ledger_sql_server.id
  sku_name     = "S0"
  license_type = "BasePrice"
}